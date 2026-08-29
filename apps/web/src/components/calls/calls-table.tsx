"use client";

import { Button } from "@doki/ui/components/button";
import { Card, CardContent } from "@doki/ui/components/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@doki/ui/components/select";
import { Skeleton } from "@doki/ui/components/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@doki/ui/components/table";
import {
	ArrowsClockwiseIcon,
	CaretLeftIcon,
	CaretRightIcon,
	PhoneIcon,
} from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { orpc } from "@/utils/orpc";

import {
	CallStatusBadge,
	formatDuration,
	formatInr,
	OutcomeBadge,
} from "./call-status-badge";

const PAGE_SIZE = 25;

const STATUS_FILTERS = [
	{ value: "ALL", label: "All statuses" },
	{ value: "QUEUED", label: "Queued" },
	{ value: "DIALING", label: "Dialing" },
	{ value: "RINGING", label: "Ringing" },
	{ value: "IN_PROGRESS", label: "In progress" },
	{ value: "COMPLETED", label: "Completed" },
	{ value: "FAILED", label: "Failed" },
	{ value: "BUSY", label: "Busy" },
	{ value: "NO_ANSWER", label: "No answer" },
	{ value: "VOICEMAIL", label: "Voicemail" },
	{ value: "CANCELED", label: "Canceled" },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];

/** Statuses that are still moving, so the list is worth refreshing on its own. */
const IN_FLIGHT = new Set(["QUEUED", "DIALING", "RINGING", "IN_PROGRESS"]);

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
	const [status, setStatus] = useState<StatusFilter>("ALL");
	const [page, setPage] = useState(0);
	const queryClient = useQueryClient();

	const calls = useQuery({
		...orpc.calls.list.queryOptions({
			input: {
				limit: PAGE_SIZE,
				offset: page * PAGE_SIZE,
				...(status === "ALL" ? {} : { status }),
			},
		}),
		// A call in flight settles through a webhook or the reconciler, neither of
		// which the browser hears about. Poll only while something is moving.
		refetchInterval: (query) => {
			const rows = query.state.data?.calls ?? [];
			return rows.some((row) => IN_FLIGHT.has(row.status)) ? 5000 : false;
		},
	});

	const stats = calls.data?.stats;
	const connectRate =
		stats && stats.total > 0
			? Math.round((stats.connected / stats.total) * 100)
			: 0;
	const costPerConnect =
		stats && stats.connected > 0 ? stats.spendInr / stats.connected : 0;

	const total = calls.data?.total ?? 0;
	const shown = calls.data?.calls.length ?? 0;
	const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

	return (
		<div className="flex flex-col gap-4">
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<StatCard
					label="Calls placed"
					value={String(stats?.total ?? 0)}
					hint="Workspace total"
				/>
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

			<div className="flex flex-wrap items-end justify-between gap-3">
				<div className="flex flex-col gap-1">
					<span className="font-medium text-sm">Status</span>
					<Select
						value={status}
						onValueChange={(v) => {
							setStatus((v ?? "ALL") as StatusFilter);
							setPage(0);
						}}
					>
						<SelectTrigger className="w-[180px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{STATUS_FILTERS.map((s) => (
								<SelectItem key={s.value} value={s.value}>
									{s.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<Button
					size="sm"
					variant="outline"
					disabled={calls.isFetching}
					onClick={() =>
						queryClient.invalidateQueries({ queryKey: orpc.calls.list.key() })
					}
				>
					<ArrowsClockwiseIcon className="size-4" />
					{calls.isFetching ? "Refreshing..." : "Refresh"}
				</Button>
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
											<p className="font-medium">
												{status === "ALL" ? "No calls yet" : "Nothing matches"}
											</p>
											<p className="max-w-sm text-muted-foreground text-sm">
												{status === "ALL"
													? "Place a call from the Leads page to see it here."
													: "No call currently has that status."}
											</p>
										</div>
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			{lastPage > 0 ? (
				<div className="flex items-center justify-between gap-3">
					<p className="text-muted-foreground text-xs">
						Showing {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + shown} of {total}
					</p>
					<div className="flex items-center gap-2">
						<Button
							size="sm"
							variant="outline"
							disabled={page === 0 || calls.isFetching}
							onClick={() => setPage((p) => Math.max(0, p - 1))}
						>
							<CaretLeftIcon className="size-4" />
							Previous
						</Button>
						<span className="text-muted-foreground text-xs tabular-nums">
							{page + 1} / {lastPage + 1}
						</span>
						<Button
							size="sm"
							variant="outline"
							disabled={page >= lastPage || calls.isFetching}
							onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
						>
							Next
							<CaretRightIcon className="size-4" />
						</Button>
					</div>
				</div>
			) : null}
		</div>
	);
}
