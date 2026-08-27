"use client";

import { Avatar, AvatarFallback } from "@doki/ui/components/avatar";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@doki/ui/components/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@doki/ui/components/chart";
import {
	CurrencyInrIcon,
	PhoneCallIcon,
	TimerIcon,
	TrendUpIcon,
} from "@phosphor-icons/react";
import { Bar, BarChart, Pie, PieChart, XAxis } from "recharts";

type Overview = {
	calls: {
		total: number;
		connected: number;
		connectRate: number;
		talkSeconds: number;
		voicemail: number;
		failed: number;
	};
	cost: {
		totalInr: number;
		perConnectInr: number;
		perMeetingInr: number;
		perMinuteInr: number;
	};
	outcomes: {
		meetings: number;
		qualified: number;
		interested: number;
		notInterested: number;
		callback: number;
		doNotCall: number;
		unknown: number;
	};
	daily: { day: string; total: number; connected: number }[];
	windowDays: number;
};

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

const volumeConfig = {
	connected: { label: "Connected", color: "var(--primary)" },
	total: {
		label: "Attempted",
		color: "color-mix(in oklab, var(--primary) 15%, transparent)",
	},
} satisfies ChartConfig;

const outcomeConfig = {
	count: { label: "Calls" },
	meetings: { label: "Meetings", color: "var(--primary)" },
	qualified: {
		label: "Qualified",
		color: "color-mix(in oklab, var(--primary) 70%, transparent)",
	},
	interested: {
		label: "Interested",
		color: "color-mix(in oklab, var(--primary) 45%, transparent)",
	},
	other: {
		label: "Other",
		color: "color-mix(in oklab, var(--primary) 18%, transparent)",
	},
} satisfies ChartConfig;

/**
 * Call performance, entirely from `dashboard.overview`.
 *
 * The four tiles lead with cost per connect and per meeting rather than raw
 * volume: volume is easy and cheap, and the number that decides whether the
 * pricing survives contact with reality is what an outcome costs.
 */
export function CallMetricsCard({
	data,
	className,
}: {
	data: Overview;
	className?: string;
}) {
	const metrics = [
		{
			icon: <PhoneCallIcon className="size-5" />,
			title: "Connect rate",
			value: `${Math.round(data.calls.connectRate * 100)}%`,
		},
		{
			icon: <TimerIcon className="size-5" />,
			title: "Talk time",
			value: duration(data.calls.talkSeconds),
		},
		{
			icon: <CurrencyInrIcon className="size-5" />,
			title: "Per connect",
			value: data.calls.connected > 0 ? inr(data.cost.perConnectInr) : "—",
		},
		{
			icon: <TrendUpIcon className="size-5" />,
			title: "Per minute",
			value: data.calls.talkSeconds > 0 ? inr(data.cost.perMinuteInr) : "—",
		},
	];

	// Grouped so the pie stays readable; "other" absorbs the long tail.
	const outcomeData = [
		{
			key: "meetings",
			count: data.outcomes.meetings,
			fill: "var(--color-meetings)",
		},
		{
			key: "qualified",
			count: data.outcomes.qualified,
			fill: "var(--color-qualified)",
		},
		{
			key: "interested",
			count: data.outcomes.interested,
			fill: "var(--color-interested)",
		},
		{
			key: "other",
			count:
				data.outcomes.notInterested +
				data.outcomes.callback +
				data.outcomes.doNotCall +
				data.outcomes.unknown,
			fill: "var(--color-other)",
		},
	].filter((slice) => slice.count > 0);

	const decided =
		data.outcomes.meetings + data.outcomes.qualified + data.outcomes.interested;

	return (
		<Card className={className}>
			<CardContent>
				<div className="grid gap-6 lg:grid-cols-5">
					<div className="flex flex-col justify-between gap-7 lg:col-span-3">
						<div className="flex flex-col gap-1">
							<span className="font-semibold text-lg">Call performance</span>
							<span className="text-muted-foreground text-sm">
								Last {data.windowDays} days
							</span>
						</div>

						<div className="grid gap-4 sm:grid-cols-2">
							{metrics.map((metric) => (
								<Card
									key={metric.title}
									className="py-2 shadow-none ring-1 ring-foreground/10"
								>
									<CardContent className="flex items-center gap-3 px-4">
										<Avatar className="rounded-sm after:border-0">
											<AvatarFallback className="shrink-0 rounded-sm bg-primary/10 text-primary">
												{metric.icon}
											</AvatarFallback>
										</Avatar>
										<div className="flex flex-col gap-0.5">
											<span className="font-medium text-muted-foreground text-sm">
												{metric.title}
											</span>
											<span className="font-medium text-lg tabular-nums">
												{metric.value}
											</span>
										</div>
									</CardContent>
								</Card>
							))}
						</div>
					</div>

					<Card className="justify-between gap-4 shadow-none ring-1 ring-foreground/10 lg:col-span-2">
						<CardHeader className="gap-1">
							<CardTitle className="font-semibold text-lg">Outcomes</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							{outcomeData.length > 0 ? (
								// Centre label is overlaid rather than drawn through recharts'
								// <Label content> callback: the callback's type is awkward to
								// satisfy and this renders identically with plain markup.
								<div className="relative">
									<ChartContainer
										config={outcomeConfig}
										className="h-38.5 w-full"
									>
										<PieChart margin={{ top: 0, bottom: 0, left: 0, right: 0 }}>
											<ChartTooltip
												cursor={false}
												content={<ChartTooltipContent hideLabel />}
											/>
											<Pie
												data={outcomeData}
												dataKey="count"
												nameKey="key"
												innerRadius={58}
												outerRadius={75}
												paddingAngle={2}
											/>
										</PieChart>
									</ChartContainer>
									<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
										<span className="font-medium text-xl tabular-nums">
											{decided}
										</span>
										<span className="text-muted-foreground text-sm">
											positive
										</span>
									</div>
								</div>
							) : (
								<p className="py-12 text-center text-muted-foreground text-sm">
									No analysed calls yet.
								</p>
							)}
							<div className="flex items-center justify-between">
								<span className="text-muted-foreground">Meetings booked</span>
								<span className="font-medium text-2xl tabular-nums">
									{data.outcomes.meetings}
								</span>
							</div>
						</CardContent>
					</Card>
				</div>
			</CardContent>

			<CardContent>
				<Card className="shadow-none ring-1 ring-foreground/10">
					<CardContent className="grid gap-6 lg:grid-cols-5">
						<div className="flex flex-col justify-center gap-3">
							<span className="font-semibold text-lg">Connect rate</span>
							<span className="text-6xl tabular-nums max-lg:text-5xl">
								{Math.round(data.calls.connectRate * 100)}%
							</span>
							<span className="text-muted-foreground text-sm">
								{data.calls.connected} of {data.calls.total} attempts reached a
								person
							</span>
						</div>
						<div className="flex flex-col gap-4 lg:col-span-4">
							<span className="font-medium">Daily volume</span>
							<span className="text-muted-foreground text-sm">
								Solid bars are connected calls. Voicemail (
								{data.calls.voicemail}) and failures ({data.calls.failed}) still
								cost telephony, so the gap between the two series is the money
								worth recovering.
							</span>

							{data.daily.length > 0 ? (
								<ChartContainer config={volumeConfig} className="h-32 w-full">
									<BarChart
										accessibilityLayer
										data={data.daily}
										margin={{ left: 0, right: 0 }}
									>
										<XAxis
											dataKey="day"
											tickLine={false}
											axisLine={false}
											tickMargin={8}
											minTickGap={24}
											tickFormatter={(value: string) =>
												new Date(value).toLocaleDateString(undefined, {
													day: "2-digit",
													month: "short",
												})
											}
											className="text-xs"
										/>
										<ChartTooltip content={<ChartTooltipContent />} />
										<Bar dataKey="total" fill="var(--color-total)" radius={4} />
										<Bar
											dataKey="connected"
											fill="var(--color-connected)"
											radius={4}
										/>
									</BarChart>
								</ChartContainer>
							) : (
								<p className="py-8 text-center text-muted-foreground text-sm">
									No calls in this window yet.
								</p>
							)}
						</div>
					</CardContent>
				</Card>
			</CardContent>
		</Card>
	);
}
