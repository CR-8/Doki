"use client";

import { Badge } from "@doki/ui/components/badge";
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
	CalendarCheckIcon,
	ClockIcon,
	LightningIcon,
	ProhibitIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

import { ScheduleFollowUpDialog } from "./schedule-followup-dialog";

type StatusFilter =
	| "ALL"
	| "PENDING"
	| "RUNNING"
	| "SUCCEEDED"
	| "FAILED"
	| "CANCELED"
	| "SKIPPED";

const STATUS_TONE: Record<
	string,
	"default" | "secondary" | "destructive" | "outline"
> = {
	PENDING: "secondary",
	RUNNING: "default",
	SUCCEEDED: "outline",
	FAILED: "destructive",
	CANCELED: "secondary",
	SKIPPED: "secondary",
};

function formatDue(value: string | Date): { label: string; overdue: boolean } {
	const date = typeof value === "string" ? new Date(value) : value;
	const diffMs = date.getTime() - Date.now();
	const overdue = diffMs <= 0;
	const mins = Math.round(Math.abs(diffMs) / 60000);

	let rel: string;
	if (mins < 60) rel = `${mins}m`;
	else if (mins < 60 * 24) rel = `${Math.round(mins / 60)}h`;
	else rel = `${Math.round(mins / (60 * 24))}d`;

	return { label: overdue ? `${rel} overdue` : `in ${rel}`, overdue };
}

export function FollowUpsTable() {
	const [status, setStatus] = useState<StatusFilter>("ALL");
	const queryClient = useQueryClient();

	const followUps = useQuery(
		orpc.followUps.list.queryOptions({
			input: { limit: 50, ...(status === "ALL" ? {} : { status }) },
		}),
	);

	const invalidate = () => {
		queryClient.invalidateQueries({ queryKey: orpc.followUps.list.key() });
	};

	const cancel = useMutation(
		orpc.followUps.cancel.mutationOptions({
			onSuccess: () => {
				toast.success("Follow-up canceled");
				invalidate();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const drain = useMutation(
		orpc.followUps.drain.mutationOptions({
			onSuccess: (result) => {
				if (!result.ran) {
					toast.info(
						result.reason === "TOO_SOON"
							? "A drain ran moments ago — the system enforces a floor between runs."
							: "Another drain is already running.",
					);
					return;
				}
				toast.success(
					`Drained ${result.claimed} due follow-up${result.claimed === 1 ? "" : "s"}`,
					{
						description: `${result.succeeded} succeeded, ${result.skipped} skipped by policy, ${result.failed} failed.`,
					},
				);
				invalidate();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const runNow = useMutation(
		orpc.followUps.runNow.mutationOptions({
			onSuccess: (result) => {
				toast.success("Brought forward", { description: result.note });
				invalidate();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const data = followUps.data;

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div className="flex flex-col gap-1">
					<span className="font-medium text-sm">Status</span>
					<Select
						value={status}
						onValueChange={(v) => setStatus((v ?? "ALL") as StatusFilter)}
					>
						<SelectTrigger className="w-[180px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{(
								[
									"ALL",
									"PENDING",
									"RUNNING",
									"SUCCEEDED",
									"SKIPPED",
									"FAILED",
									"CANCELED",
								] as StatusFilter[]
							).map((s) => (
								<SelectItem key={s} value={s}>
									{s === "ALL" ? "All" : s.toLowerCase()}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="flex flex-wrap items-center gap-3">
					<Button
						size="sm"
						variant="outline"
						disabled={drain.isPending}
						onClick={() => drain.mutate({ force: false })}
					>
						<ArrowsClockwiseIcon className="size-4" />
						{drain.isPending ? "Draining..." : "Drain now"}
					</Button>
					<ScheduleFollowUpDialog />
					{data ? (
						<Card className="px-3 py-2">
							<CardContent className="flex items-center gap-4 p-0 text-xs">
								<div className="flex flex-col">
									<span className="text-muted-foreground">Pending</span>
									<span className="font-mono">{data.pending}</span>
								</div>
								<div className="flex flex-col">
									<span className="text-muted-foreground">Due now</span>
									<span className="font-mono">{data.dueNow}</span>
								</div>
							</CardContent>
						</Card>
					) : null}
				</div>
			</div>

			<Card>
				<CardContent className="p-0">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Lead</TableHead>
								<TableHead>Action</TableHead>
								<TableHead>Due</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Why</TableHead>
								<TableHead className="text-right" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{followUps.isPending ? (
								[0, 1, 2].map((i) => (
									<TableRow key={i}>
										{[0, 1, 2, 3, 4, 5].map((c) => (
											<TableCell key={c}>
												<Skeleton className="h-5 w-full" />
											</TableCell>
										))}
									</TableRow>
								))
							) : data && data.actions.length > 0 ? (
								data.actions.map((action) => {
									const due = formatDue(action.dueAt);
									const isPending = action.status === "PENDING";
									return (
										<TableRow key={action.id}>
											<TableCell>
												<Link
													href={`/leads/${action.leadId}`}
													className="flex flex-col hover:underline"
												>
													<span className="font-medium">
														{action.leadName ?? action.leadPhone ?? "Unknown"}
													</span>
													<span className="font-mono text-muted-foreground text-xs">
														{action.leadPhone}
													</span>
												</Link>
											</TableCell>
											<TableCell>
												<div className="flex flex-col gap-1">
													<Badge variant="outline">
														{action.type.toLowerCase()}
													</Badge>
													{action.agentName ? (
														<span className="text-muted-foreground text-xs">
															{action.agentName}
														</span>
													) : null}
												</div>
											</TableCell>
											<TableCell>
												<span
													className={
														due.overdue && isPending
															? "font-medium text-amber-600 text-sm dark:text-amber-500"
															: "text-sm"
													}
												>
													{due.label}
												</span>
											</TableCell>
											<TableCell>
												<div className="flex flex-col gap-1">
													<Badge
														variant={STATUS_TONE[action.status] ?? "secondary"}
													>
														{action.status.toLowerCase()}
													</Badge>
													{action.attempt > 0 ? (
														<span className="text-muted-foreground text-xs">
															attempt {action.attempt}/{action.maxAttempts}
														</span>
													) : null}
												</div>
											</TableCell>
											<TableCell className="max-w-xs">
												<span className="text-sm">{action.note ?? "—"}</span>
												{action.lastError ? (
													<p className="text-muted-foreground text-xs">
														{action.lastError}
													</p>
												) : null}
											</TableCell>
											<TableCell>
												<div className="flex items-center justify-end gap-1">
													<Button
														size="icon"
														variant="ghost"
														title="Run on next drain"
														disabled={!isPending || runNow.isPending}
														onClick={() => runNow.mutate({ id: action.id })}
													>
														<LightningIcon className="size-4" />
													</Button>
													<Button
														size="icon"
														variant="ghost"
														title="Cancel"
														disabled={!isPending || cancel.isPending}
														onClick={() => cancel.mutate({ id: action.id })}
													>
														<ProhibitIcon className="size-4" />
													</Button>
												</div>
											</TableCell>
										</TableRow>
									);
								})
							) : (
								<TableRow>
									<TableCell colSpan={6}>
										<div className="flex flex-col items-center gap-2 py-10 text-center">
											<CalendarCheckIcon className="size-8 text-muted-foreground" />
											<p className="font-medium">Nothing scheduled</p>
											<p className="max-w-sm text-muted-foreground text-sm">
												Follow-ups appear here automatically after a call is
												analysed, or when you schedule one by hand.
											</p>
										</div>
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			<p className="flex items-center gap-1.5 text-muted-foreground text-xs">
				<ClockIcon className="size-3.5" />
				Due follow-ups are drained on a schedule. Every call still passes the
				calling policy — one refused outside working hours is deferred, not
				dropped.
			</p>
		</div>
	);
}
