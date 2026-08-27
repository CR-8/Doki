"use client";

import { Button } from "@doki/ui/components/button";
import { Card } from "@doki/ui/components/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@doki/ui/components/select";
import { Skeleton } from "@doki/ui/components/skeleton";
import {
	CalendarCheckIcon,
	CurrencyInrIcon,
	PhoneCallIcon,
	TargetIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { orpc } from "@/utils/orpc";

import { CallMetricsCard } from "./call-metrics-card";
import { CallsDatatable } from "./calls-datatable";
import { PipelineCard } from "./pipeline-card";
import { StatisticsCard } from "./statistics-card";

function inr(value: number): string {
	if (!Number.isFinite(value) || value === 0) return "₹0";
	if (value >= 1000) return `₹${Math.round(value).toLocaleString("en-IN")}`;
	return `₹${value.toFixed(2)}`;
}

export function DashboardOverview() {
	const [days, setDays] = useState("30");
	const overview = useQuery(
		orpc.dashboard.overview.queryOptions({ input: { days: Number(days) } }),
	);

	if (overview.isPending) {
		return (
			<div className="flex flex-col gap-6">
				<div className="grid gap-6 sm:grid-cols-3">
					{[0, 1, 2].map((i) => (
						<Skeleton key={i} className="h-32 w-full" />
					))}
				</div>
				<Skeleton className="h-96 w-full" />
			</div>
		);
	}

	const d = overview.data;
	if (!d) return null;

	return (
		<div className="grid grid-cols-2 gap-6 lg:grid-cols-3">
			<div className="col-span-full flex flex-wrap items-center justify-between gap-3">
				<Select value={days} onValueChange={(v) => setDays(v ?? "30")}>
					<SelectTrigger className="w-40">
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
						nativeButton={false}
						render={<Link href="/follow-ups" />}
					>
						{d.followUps.dueNow} follow-up{d.followUps.dueNow === 1 ? "" : "s"}{" "}
						due
					</Button>
				) : null}
			</div>

			<div className="col-span-full grid gap-6 sm:grid-cols-3 md:max-lg:grid-cols-1">
				<StatisticsCard
					icon={<PhoneCallIcon className="size-4" />}
					value={String(d.calls.total)}
					title="Calls placed"
					detail={
						d.calls.total > 0
							? `${d.calls.connected} connected · ${Math.round(d.calls.connectRate * 100)}% connect rate`
							: null
					}
				/>
				<StatisticsCard
					icon={<CalendarCheckIcon className="size-4" />}
					value={String(d.outcomes.meetings)}
					title="Meetings booked"
					detail={
						d.outcomes.qualified + d.outcomes.interested > 0
							? `${d.outcomes.qualified} qualified · ${d.outcomes.interested} interested`
							: null
					}
				/>
				<StatisticsCard
					icon={<CurrencyInrIcon className="size-4" />}
					value={
						d.outcomes.meetings > 0
							? inr(d.cost.perMeetingInr)
							: inr(d.cost.totalInr)
					}
					title={d.outcomes.meetings > 0 ? "Cost per meeting" : "Spend"}
					detail={
						d.outcomes.meetings > 0
							? `${inr(d.cost.totalInr)} spent across ${d.calls.total} calls`
							: d.calls.connected > 0
								? `${inr(d.cost.perConnectInr)} per connect`
								: null
					}
				/>
			</div>

			<div className="grid gap-6 max-xl:col-span-full lg:max-xl:grid-cols-2">
				<PipelineCard
					leads={d.leads}
					followUps={d.followUps}
					agents={d.agents}
					compliance={d.compliance}
					className="justify-between"
				/>

				<Card className="flex flex-col justify-between gap-5 p-6">
					<div className="flex flex-col gap-1">
						<div className="flex items-center gap-2">
							<TargetIcon className="size-4" />
							<span className="font-semibold text-lg">Unit economics</span>
						</div>
						<span className="text-muted-foreground text-sm">
							What each outcome actually costs
						</span>
					</div>

					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-1">
							<span className="text-muted-foreground text-xs">
								Per connected call
							</span>
							<span className="font-semibold text-2xl tabular-nums">
								{d.calls.connected > 0 ? inr(d.cost.perConnectInr) : "—"}
							</span>
						</div>
						<div className="flex flex-col gap-1">
							<span className="text-muted-foreground text-xs">
								Per talk minute
							</span>
							<span className="font-semibold text-2xl tabular-nums">
								{d.calls.talkSeconds > 0 ? inr(d.cost.perMinuteInr) : "—"}
							</span>
						</div>
						<div className="flex flex-col gap-1">
							<span className="text-muted-foreground text-xs">
								Per meeting booked
							</span>
							<span className="font-semibold text-2xl tabular-nums">
								{d.outcomes.meetings > 0 ? inr(d.cost.perMeetingInr) : "—"}
							</span>
						</div>
					</div>

					<p className="text-muted-foreground text-xs">
						Includes telephony, speech, and model cost attributed per call.
					</p>
				</Card>
			</div>

			<CallMetricsCard
				data={d}
				className="col-span-full *:data-[slot=card-content]:space-y-6 xl:col-span-2"
			/>

			<Card className="col-span-full w-full py-0">
				<CallsDatatable />
			</Card>
		</div>
	);
}
