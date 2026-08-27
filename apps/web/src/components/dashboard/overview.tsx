"use client";

import { Badge } from "@doki/ui/components/badge";
import { Button } from "@doki/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@doki/ui/components/card";
import { Progress } from "@doki/ui/components/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@doki/ui/components/select";
import { Separator } from "@doki/ui/components/separator";
import { Skeleton } from "@doki/ui/components/skeleton";
import {
	CalendarCheckIcon,
	CurrencyInrIcon,
	PhoneCallIcon,
	ShieldCheckIcon,
	UsersIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { orpc } from "@/utils/orpc";

function inr(value: number): string {
	if (!Number.isFinite(value) || value === 0) return "₹0";
	if (value >= 1000) return `₹${Math.round(value).toLocaleString("en-IN")}`;
	return `₹${value.toFixed(2)}`;
}

function duration(seconds: number): string {
	if (!seconds) return "0m";
	const h = Math.floor(seconds / 3600);
	const m = Math.round((seconds % 3600) / 60);
	return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function Metric({
	label,
	value,
	hint,
	icon: Icon,
}: {
	label: string;
	value: string;
	hint?: string;
	icon: React.ComponentType<{ className?: string }>;
}) {
	return (
		<Card>
			<CardContent className="flex flex-col gap-2 p-4">
				<div className="flex items-center justify-between">
					<span className="text-muted-foreground text-xs">{label}</span>
					<Icon className="size-4 text-muted-foreground" />
				</div>
				<span className="font-semibold text-2xl tabular-nums">{value}</span>
				{hint ? (
					<span className="text-muted-foreground text-xs">{hint}</span>
				) : null}
			</CardContent>
		</Card>
	);
}

/** Compact bar strip — enough to see a trend without a charting dependency. */
function VolumeStrip({
	daily,
}: {
	daily: { day: string; total: number; connected: number }[];
}) {
	if (daily.length === 0) {
		return (
			<p className="py-6 text-center text-muted-foreground text-sm">
				No calls in this window yet.
			</p>
		);
	}

	const max = Math.max(...daily.map((d) => d.total), 1);

	return (
		<div className="flex h-32 items-end gap-1">
			{daily.map((d) => {
				const totalPct = (d.total / max) * 100;
				const connectedPct = (d.connected / max) * 100;
				return (
					<div
						key={d.day}
						className="group relative flex flex-1 flex-col justify-end"
						title={`${d.day}: ${d.total} calls, ${d.connected} connected`}
					>
						<div
							className="w-full rounded-t-sm bg-muted"
							style={{ height: `${Math.max(totalPct, 2)}%` }}
						/>
						<div
							className="absolute bottom-0 w-full rounded-t-sm bg-primary"
							style={{
								height: `${Math.max(connectedPct, d.connected ? 2 : 0)}%`,
							}}
						/>
					</div>
				);
			})}
		</div>
	);
}

export function DashboardOverview() {
	const [days, setDays] = useState("30");
	const overview = useQuery(
		orpc.dashboard.overview.queryOptions({ input: { days: Number(days) } }),
	);

	if (overview.isPending) {
		return (
			<div className="flex flex-col gap-4">
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					{[0, 1, 2, 3].map((i) => (
						<Skeleton key={i} className="h-28 w-full" />
					))}
				</div>
				<Skeleton className="h-64 w-full" />
			</div>
		);
	}

	const d = overview.data;
	if (!d) return null;

	const connectPct = Math.round(d.calls.connectRate * 100);
	const consentPct =
		d.leads.total > 0
			? Math.round((d.leads.withConsent / d.leads.total) * 100)
			: 0;

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-center justify-between gap-3">
				<Select value={days} onValueChange={(v) => setDays(v ?? "30")}>
					<SelectTrigger className="w-[160px]">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="7">Last 7 days</SelectItem>
						<SelectItem value="30">Last 30 days</SelectItem>
						<SelectItem value="90">Last 90 days</SelectItem>
					</SelectContent>
				</Select>

				{d.followUps.dueNow > 0 ? (
					<Button
						size="sm"
						variant="outline"
						render={<Link href="/follow-ups" />}
					>
						{d.followUps.dueNow} follow-up{d.followUps.dueNow === 1 ? "" : "s"}{" "}
						due
					</Button>
				) : null}
			</div>

			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<Metric
					label="Calls placed"
					value={String(d.calls.total)}
					hint={`${d.calls.connected} connected · ${connectPct}%`}
					icon={PhoneCallIcon}
				/>
				<Metric
					label="Meetings booked"
					value={String(d.outcomes.meetings)}
					hint={`${d.outcomes.qualified} qualified · ${d.outcomes.interested} interested`}
					icon={CalendarCheckIcon}
				/>
				<Metric
					label="Spend"
					value={inr(d.cost.totalInr)}
					hint={
						d.cost.perMinuteInr > 0
							? `${inr(d.cost.perMinuteInr)}/min · ${duration(d.calls.talkSeconds)} talk`
							: "No billable time yet"
					}
					icon={CurrencyInrIcon}
				/>
				<Metric
					label="Cost per meeting"
					value={d.outcomes.meetings > 0 ? inr(d.cost.perMeetingInr) : "—"}
					hint={
						d.calls.connected > 0
							? `${inr(d.cost.perConnectInr)} per connect`
							: "Needs a connected call"
					}
					icon={CurrencyInrIcon}
				/>
			</div>

			<div className="grid gap-4 lg:grid-cols-3">
				<Card className="lg:col-span-2">
					<CardHeader>
						<CardTitle className="text-base">Call volume</CardTitle>
						<CardDescription>
							Solid bars are connected calls; muted is total attempts.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<VolumeStrip daily={d.daily} />
						<div className="flex flex-wrap gap-2">
							<Badge variant="secondary">{d.calls.voicemail} voicemail</Badge>
							<Badge variant="secondary">{d.calls.failed} failed</Badge>
							<Badge variant="secondary">
								{d.outcomes.notInterested} not interested
							</Badge>
							<Badge variant="secondary">{d.outcomes.callback} callback</Badge>
							{d.outcomes.unknown > 0 ? (
								<Badge variant="outline">
									{d.outcomes.unknown} awaiting review
								</Badge>
							) : null}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<div className="flex items-center gap-2">
							<ShieldCheckIcon className="size-4" />
							<CardTitle className="text-base">Compliance</CardTitle>
						</div>
						<CardDescription>
							What the calling policy is holding back.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<div className="flex flex-col gap-1.5">
							<div className="flex items-center justify-between text-sm">
								<span className="text-muted-foreground">
									Leads with consent
								</span>
								<span className="font-mono">
									{d.leads.withConsent}/{d.leads.total}
								</span>
							</div>
							<Progress value={consentPct} />
							<span className="text-muted-foreground text-xs">
								Promotional calls are refused without recorded consent.
							</span>
						</div>

						<Separator />

						<div className="flex items-center justify-between text-sm">
							<span className="text-muted-foreground">On do-not-call</span>
							<span className="font-mono">
								{d.compliance.suppressionEntries}
							</span>
						</div>
						<div className="flex items-center justify-between text-sm">
							<span className="text-muted-foreground">Suppressed leads</span>
							<span className="font-mono">{d.leads.suppressed}</span>
						</div>
						<div className="flex items-center justify-between text-sm">
							<span className="text-muted-foreground">Not yet contacted</span>
							<span className="font-mono">{d.leads.untouched}</span>
						</div>
					</CardContent>
				</Card>
			</div>

			<div className="grid gap-4 lg:grid-cols-3">
				<Card className="lg:col-span-2">
					<CardHeader>
						<CardTitle className="text-base">Recent calls</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						{d.recent.length === 0 ? (
							<p className="py-6 text-center text-muted-foreground text-sm">
								No calls yet. Start from the Leads page.
							</p>
						) : (
							d.recent.map((call) => (
								<Link
									key={call.id}
									href={`/calls/${call.id}`}
									className="flex flex-col gap-1 rounded-md border border-border p-3 transition-colors hover:bg-muted/50"
								>
									<div className="flex items-center justify-between gap-2">
										<span className="font-medium text-sm">
											{call.leadName ?? call.toNumber}
										</span>
										<span className="font-mono text-muted-foreground text-xs">
											{inr(Number(call.totalCostInr))}
										</span>
									</div>
									<p className="line-clamp-2 text-muted-foreground text-sm">
										{call.summary ??
											`${call.status.toLowerCase().replace("_", " ")}`}
									</p>
								</Link>
							))
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<div className="flex items-center gap-2">
							<UsersIcon className="size-4" />
							<CardTitle className="text-base">Pipeline</CardTitle>
						</div>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						<div className="flex items-center justify-between text-sm">
							<span className="text-muted-foreground">Total leads</span>
							<span className="font-mono">{d.leads.total}</span>
						</div>
						<div className="flex items-center justify-between text-sm">
							<span className="text-muted-foreground">Follow-ups pending</span>
							<span className="font-mono">{d.followUps.pending}</span>
						</div>
						<div className="flex items-center justify-between text-sm">
							<span className="text-muted-foreground">Active agents</span>
							<span className="font-mono">
								{d.agents.active}/{d.agents.total}
							</span>
						</div>

						{d.followUps.failed > 0 ? (
							<div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2">
								<WarningIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
								<span className="text-sm">
									{d.followUps.failed} follow-up
									{d.followUps.failed === 1 ? "" : "s"} failed
								</span>
							</div>
						) : null}

						{d.agents.active === 0 ? (
							<div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
								<WarningIcon className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
								<span className="text-sm">
									No active agent — calls cannot be placed.
								</span>
							</div>
						) : null}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
