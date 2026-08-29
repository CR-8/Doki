"use client";

import { Card, CardContent } from "@doki/ui/components/card";
import { Skeleton } from "@doki/ui/components/skeleton";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@doki/ui/components/tabs";
import { WarningIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { orpc } from "@/utils/orpc";

import { AuditLog } from "./audit-log";
import { ConsentRegistry } from "./consent-registry";
import { SuppressionList } from "./suppression-list";

function StatCard({
	label,
	value,
	hint,
}: {
	label: string;
	value: string;
	hint: string;
}) {
	return (
		<Card>
			<CardContent className="flex flex-col gap-1 p-4">
				<span className="text-muted-foreground text-xs">{label}</span>
				<span className="font-semibold text-2xl tabular-nums">{value}</span>
				<span className="text-muted-foreground text-xs">{hint}</span>
			</CardContent>
		</Card>
	);
}

/**
 * The compliance screen.
 *
 * These four tables were always being written to — every dispatch, refusal and
 * opt-out lands in them. This is what makes them readable, which is the
 * difference between having a compliance story and being able to show one.
 */
export function ComplianceCentre() {
	const overview = useQuery(orpc.compliance.overview.queryOptions());
	const stale = useQuery(
		orpc.compliance.staleScrubs.queryOptions({ input: { limit: 25 } }),
	);

	const data = overview.data;
	const staleCount = stale.data?.entries.length ?? 0;

	const consentCoverage =
		data && data.consent.leadsTotal > 0
			? Math.round(
					(data.consent.leadsWithConsent / data.consent.leadsTotal) * 100,
				)
			: 0;

	return (
		<div className="flex flex-col gap-6">
			{overview.isPending ? (
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					{[0, 1, 2, 3].map((i) => (
						<Skeleton key={i} className="h-24 w-full" />
					))}
				</div>
			) : (
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					<StatCard
						label="Numbers blocked"
						value={String(data?.suppression.total ?? 0)}
						hint={`${data?.suppression.optOuts ?? 0} from opt-outs`}
					/>
					<StatCard
						label="Consent on file"
						value={`${consentCoverage}%`}
						hint={`${data?.consent.leadsWithConsent ?? 0} of ${data?.consent.leadsTotal ?? 0} leads`}
					/>
					<StatCard
						label="DND scrubs"
						value={String(data?.dnd.checked ?? 0)}
						hint={`${data?.dnd.registered ?? 0} registered · ${data?.dnd.stale ?? 0} stale`}
					/>
					<StatCard
						label="Audit events"
						value={String(data?.audit.total ?? 0)}
						hint={`${data?.audit.lastWeek ?? 0} in the last 7 days`}
					/>
				</div>
			)}

			{staleCount > 0 ? (
				<Card className="border-amber-500/40">
					<CardContent className="flex items-start gap-3 p-4">
						<WarningIcon className="mt-0.5 size-5 text-amber-600 dark:text-amber-500" />
						<div className="flex flex-col gap-1">
							<p className="font-medium text-sm">
								{staleCount} number{staleCount === 1 ? " has" : "s have"} a
								stale DND scrub
							</p>
							<p className="text-muted-foreground text-sm">
								The policy engine fails closed on these, so promotional calls to
								them are refused until the scrub is refreshed. This is usually
								why a call is blocked for no visible reason.
							</p>
							<p className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
								{(stale.data?.entries ?? []).slice(0, 6).map((entry) => (
									<Link
										key={entry.phoneE164}
										href={`/leads/${entry.leadId}`}
										className="font-mono text-xs hover:underline"
									>
										{entry.phoneE164}
									</Link>
								))}
							</p>
						</div>
					</CardContent>
				</Card>
			) : null}

			<Tabs defaultValue="suppressions">
				<TabsList>
					<TabsTrigger value="suppressions">Do-not-call list</TabsTrigger>
					<TabsTrigger value="consent">Consent trail</TabsTrigger>
					<TabsTrigger value="audit">Audit log</TabsTrigger>
				</TabsList>

				<TabsContent value="suppressions">
					<SuppressionList />
				</TabsContent>
				<TabsContent value="consent">
					<ConsentRegistry />
				</TabsContent>
				<TabsContent value="audit">
					<AuditLog />
				</TabsContent>
			</Tabs>
		</div>
	);
}
