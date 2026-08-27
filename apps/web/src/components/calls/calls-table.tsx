"use client";

import { Card, CardContent } from "@doki/ui/components/card";
import { Skeleton } from "@doki/ui/components/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@doki/ui/components/table";
import { PhoneIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { orpc } from "@/utils/orpc";

import {
	CallStatusBadge,
	formatDuration,
	formatInr,
	OutcomeBadge,
} from "./call-status-badge";

function StatCard({
	label,
	value,
	hint,
}: {
	label: string;
	value: string;
	hint?: string;
}) {
	return (
		<Card>
			<CardContent className="flex flex-col gap-1 p-4">
				<span className="text-muted-foreground text-xs">{label}</span>
				<span className="font-semibold text-2xl tabular-nums">{value}</span>
				{hint ? (
					<span className="text-muted-foreground text-xs">{hint}</span>
				) : null}
			</CardContent>
		</Card>
	);
}

export function CallsTable() {
	const calls = useQuery(
		orpc.calls.list.queryOptions({ input: { limit: 50, offset: 0 } }),
	);

	const stats = calls.data?.stats;
	const connectRate =
		stats && stats.total > 0
			? Math.round((stats.connected / stats.total) * 100)
			: 0;
	const costPerConnect =
		stats && stats.connected > 0 ? stats.spendInr / stats.connected : 0;

	return (
		<div className="flex flex-col gap-4">
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<StatCard label="Calls placed" value={String(stats?.total ?? 0)} />
				<StatCard
					label="Connected"
					value={`${stats?.connected ?? 0}`}
					hint={`${connectRate}% connect rate`}
				/>
				<StatCard
					label="Talk time"
					value={formatDuration(stats?.talkSeconds ?? 0)}
					hint="Billable minutes only"
				/>
				<StatCard
					label="Spend"
					value={formatInr(stats?.spendInr ?? 0)}
					hint={
						costPerConnect > 0
							? `${formatInr(costPerConnect)} per connect`
							: "No connects yet"
					}
				/>
			</div>

			<Card>
				<CardContent className="p-0">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Lead</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Outcome</TableHead>
								<TableHead className="text-right">Duration</TableHead>
								<TableHead className="text-right">Cost</TableHead>
								<TableHead>When</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{calls.isPending ? (
								[0, 1, 2].map((i) => (
									<TableRow key={i}>
										{[0, 1, 2, 3, 4, 5].map((c) => (
											<TableCell key={c}>
												<Skeleton className="h-5 w-full" />
											</TableCell>
										))}
									</TableRow>
								))
							) : calls.data && calls.data.calls.length > 0 ? (
								calls.data.calls.map((row) => (
									<TableRow key={row.id} className="cursor-pointer">
										<TableCell>
											<Link href={`/calls/${row.id}`} className="flex flex-col">
												<span className="font-medium">
													{row.leadName ?? row.toNumber}
												</span>
												<span className="font-mono text-muted-foreground text-xs">
													{row.toNumber}
													{row.attempt > 1 ? ` · attempt ${row.attempt}` : ""}
												</span>
											</Link>
										</TableCell>
										<TableCell>
											<CallStatusBadge status={row.status} />
										</TableCell>
										<TableCell>
											<OutcomeBadge outcome={row.outcome} />
										</TableCell>
										<TableCell className="text-right font-mono text-sm">
											{formatDuration(row.billableSeconds)}
										</TableCell>
										<TableCell className="text-right font-mono text-sm">
											{formatInr(row.totalCostInr)}
										</TableCell>
										<TableCell className="text-muted-foreground text-sm">
											{new Date(row.createdAt).toLocaleString(undefined, {
												day: "2-digit",
												month: "short",
												hour: "2-digit",
												minute: "2-digit",
											})}
										</TableCell>
									</TableRow>
								))
							) : (
								<TableRow>
									<TableCell colSpan={6}>
										<div className="flex flex-col items-center gap-2 py-10 text-center">
											<PhoneIcon className="size-8 text-muted-foreground" />
											<p className="font-medium">No calls yet</p>
											<p className="max-w-sm text-muted-foreground text-sm">
												Place a call from the Leads page to see it here.
											</p>
										</div>
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		</div>
	);
}
