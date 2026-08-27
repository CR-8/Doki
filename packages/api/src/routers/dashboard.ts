import {
	cached_,
	DEFAULT_TTL_SECONDS,
	tenantKey,
} from "@doki/connectors/cache/index";
import {
	agent as agentTable,
	callAnalysis,
	call as callTable,
	followUpAction,
	lead as leadTable,
	suppressionEntry,
} from "@doki/db/schema";
import { and, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";

import { tenantProcedure } from "../index";

export const dashboardRouter = {
	/**
	 * Everything the overview screen needs, in one round trip.
	 *
	 * Deliberately reports COST alongside outcomes. Connect rate and meetings
	 * booked are only half the picture — what a buyer needs before committing
	 * budget is what a booked meeting actually costs, and that number has to be
	 * visible without a spreadsheet.
	 */
	overview: tenantProcedure
		.input(z.object({ days: z.number().int().min(1).max(90).default(30) }))
		.handler(async ({ context, input }) => {
			const { db, organizationId } = context;

			// The overview runs eight aggregates. Cached for five minutes and
			// dropped on any write that would change it, so a console left open
			// does not re-run them on every poll.
			return cached_(
				tenantKey("dashboard", organizationId, `overview:${input.days}`),
				DEFAULT_TTL_SECONDS,
				() => loadOverview(db, organizationId, input.days),
			);
		}),
};

/** Shape of the recent-calls strip, declared so the client keeps inference. */
type RecentCall = {
	id: string;
	status: string;
	outcome: string;
	toNumber: string;
	billableSeconds: number;
	totalCostInr: string;
	createdAt: Date;
	leadName: string | null;
	summary: string | null;
};

// biome-ignore lint/suspicious/noExplicitAny: drizzle db type is not portable across packages
async function loadOverview(db: any, organizationId: string, days: number) {
	const input = { days };
	const since = new Date(Date.now() - input.days * 24 * 3600 * 1000);

	const inWindow = and(
		eq(callTable.organizationId, organizationId),
		gte(callTable.createdAt, since),
	);

	const [calls] = await db
		.select({
			total: count(),
			connected: sql<number>`cast(count(*) filter (where ${callTable.billableSeconds} > 0) as int)`,
			talkSeconds: sql<number>`cast(coalesce(sum(${callTable.billableSeconds}), 0) as int)`,
			spendInr: sql<number>`coalesce(sum(${callTable.totalCostInr}), 0)`,
			voicemail: sql<number>`cast(count(*) filter (where ${callTable.status} = 'VOICEMAIL') as int)`,
			failed: sql<number>`cast(count(*) filter (where ${callTable.status} = 'FAILED') as int)`,
		})
		.from(callTable)
		.where(inWindow);

	// Sales outcomes, which are separate from technical call state.
	const outcomeRows = await db
		.select({
			outcome: callTable.outcome,
			value: count(),
		})
		.from(callTable)
		.where(inWindow)
		.groupBy(callTable.outcome);

	const outcomes: Record<string, number> = {};
	for (const row of outcomeRows) outcomes[row.outcome] = row.value;

	const [leads] = await db
		.select({
			total: count(),
			withConsent: sql<number>`cast(count(*) filter (where ${leadTable.consentStatus} = 'GRANTED') as int)`,
			suppressed: sql<number>`cast(count(*) filter (where ${leadTable.status} = 'SUPPRESSED') as int)`,
			untouched: sql<number>`cast(count(*) filter (where ${leadTable.attemptCount} = 0) as int)`,
		})
		.from(leadTable)
		.where(eq(leadTable.organizationId, organizationId));

	const [followUps] = await db
		.select({
			pending: sql<number>`cast(count(*) filter (where ${followUpAction.status} = 'PENDING') as int)`,
			dueNow: sql<number>`cast(count(*) filter (where ${followUpAction.status} = 'PENDING' and ${followUpAction.dueAt} <= now()) as int)`,
			failed: sql<number>`cast(count(*) filter (where ${followUpAction.status} = 'FAILED') as int)`,
		})
		.from(followUpAction)
		.where(eq(followUpAction.organizationId, organizationId));

	const [suppressed] = await db
		.select({ value: count() })
		.from(suppressionEntry)
		.where(eq(suppressionEntry.organizationId, organizationId));

	// Daily call volume for the trend strip.
	const daily = await db
		.select({
			day: sql<string>`to_char(date_trunc('day', ${callTable.createdAt}), 'YYYY-MM-DD')`,
			total: count(),
			connected: sql<number>`cast(count(*) filter (where ${callTable.billableSeconds} > 0) as int)`,
		})
		.from(callTable)
		.where(inWindow)
		.groupBy(sql`date_trunc('day', ${callTable.createdAt})`)
		.orderBy(sql`date_trunc('day', ${callTable.createdAt})`);

	const recent = (await db
		.select({
			id: callTable.id,
			status: callTable.status,
			outcome: callTable.outcome,
			toNumber: callTable.toNumber,
			billableSeconds: callTable.billableSeconds,
			totalCostInr: callTable.totalCostInr,
			createdAt: callTable.createdAt,
			leadName: leadTable.name,
			summary: callAnalysis.summary,
		})
		.from(callTable)
		.leftJoin(leadTable, eq(callTable.leadId, leadTable.id))
		.leftJoin(callAnalysis, eq(callAnalysis.callId, callTable.id))
		.where(eq(callTable.organizationId, organizationId))
		.orderBy(desc(callTable.createdAt))
		.limit(5)) as RecentCall[];

	const [agents] = await db
		.select({
			total: count(),
			active: sql<number>`cast(count(*) filter (where ${agentTable.status} = 'ACTIVE') as int)`,
		})
		.from(agentTable)
		.where(eq(agentTable.organizationId, organizationId));

	// Refusals in the window — the compliance gate's visible output.
	const [refusedLeads] = await db
		.select({ value: count() })
		.from(leadTable)
		.where(
			and(
				eq(leadTable.organizationId, organizationId),
				lte(leadTable.attemptCount, 0),
				eq(leadTable.status, "SUPPRESSED"),
			),
		);

	const totalCalls = calls?.total ?? 0;
	const connected = calls?.connected ?? 0;
	const spend = Number(calls?.spendInr ?? 0);
	const meetings = outcomes.MEETING_BOOKED ?? 0;
	const qualified = outcomes.QUALIFIED ?? 0;
	const interested = outcomes.INTERESTED ?? 0;

	return {
		windowDays: input.days,
		calls: {
			total: totalCalls,
			connected,
			connectRate: totalCalls > 0 ? connected / totalCalls : 0,
			talkSeconds: calls?.talkSeconds ?? 0,
			voicemail: calls?.voicemail ?? 0,
			failed: calls?.failed ?? 0,
		},
		cost: {
			totalInr: spend,
			perConnectInr: connected > 0 ? spend / connected : 0,
			// The number that decides whether the pricing works.
			perMeetingInr: meetings > 0 ? spend / meetings : 0,
			perMinuteInr:
				(calls?.talkSeconds ?? 0) > 0
					? spend / ((calls?.talkSeconds ?? 0) / 60)
					: 0,
		},
		outcomes: {
			meetings,
			qualified,
			interested,
			notInterested: outcomes.NOT_INTERESTED ?? 0,
			callback: outcomes.CALLBACK_REQUESTED ?? 0,
			doNotCall: outcomes.DO_NOT_CALL ?? 0,
			unknown: outcomes.UNKNOWN ?? 0,
		},
		leads: {
			total: leads?.total ?? 0,
			withConsent: leads?.withConsent ?? 0,
			suppressed: leads?.suppressed ?? 0,
			untouched: leads?.untouched ?? 0,
		},
		followUps: {
			pending: followUps?.pending ?? 0,
			dueNow: followUps?.dueNow ?? 0,
			failed: followUps?.failed ?? 0,
		},
		compliance: {
			suppressionEntries: suppressed?.value ?? 0,
			suppressedLeads: refusedLeads?.value ?? 0,
		},
		agents: { total: agents?.total ?? 0, active: agents?.active ?? 0 },
		daily,
		recent,
	};
}
