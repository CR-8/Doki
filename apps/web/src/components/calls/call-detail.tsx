"use client";

import {
	AudioPlayerButton,
	AudioPlayerDuration,
	AudioPlayerProgress,
	AudioPlayerProvider,
	AudioPlayerSpeed,
	AudioPlayerTime,
	useAudioPlayerTime,
} from "@doki/ui/components/audio-player";
import { Badge } from "@doki/ui/components/badge";
import { Button } from "@doki/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@doki/ui/components/card";
import { Separator } from "@doki/ui/components/separator";
import { Skeleton } from "@doki/ui/components/skeleton";
import { cn } from "@doki/ui/lib/utils";
import {
	RobotIcon,
	SparkleIcon,
	UserIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

import {
	CallStatusBadge,
	formatDuration,
	formatInr,
	OutcomeBadge,
} from "./call-status-badge";

type Turn = {
	id: string;
	role: string;
	content: string;
	offsetMs: number;
	sequence: number;
};

const GUARDRAIL_LABELS: Record<string, string> = {
	REQUESTED_OPT_OUT: "Asked not to be called again",
	QUOTED_PRICING: "Quoted pricing",
	CLAIMED_TO_BE_HUMAN: "Claimed to be human",
	MADE_COMMITMENT: "Made a commitment",
	ABUSIVE_LANGUAGE: "Abusive language",
	WRONG_PERSON: "Wrong person",
};

/**
 * Transcript rows highlight as the recording plays. Being able to hear what
 * the agent actually said, lined up with the text, is what makes a customer
 * trust an automated caller.
 */
function TranscriptTurns({ turns }: { turns: Turn[] }) {
	const currentTime = useAudioPlayerTime();
	const currentMs = (currentTime ?? 0) * 1000;

	const activeIndex = turns.reduce((active, turn, index) => {
		return turn.offsetMs <= currentMs ? index : active;
	}, -1);

	if (turns.length === 0) {
		return (
			<p className="py-8 text-center text-muted-foreground text-sm">
				No transcript captured for this call.
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			{turns.map((turn, index) => {
				const isAgent = turn.role === "assistant";
				const isActive = index === activeIndex;
				return (
					<div
						key={turn.id}
						className={cn(
							"flex gap-3 rounded-md p-2 transition-colors",
							isActive && "bg-muted",
						)}
					>
						<div
							className={cn(
								"flex size-7 shrink-0 items-center justify-center rounded-full border",
								isAgent ? "border-primary/30 bg-primary/10" : "border-border",
							)}
						>
							{isAgent ? (
								<RobotIcon className="size-4" />
							) : (
								<UserIcon className="size-4" />
							)}
						</div>
						<div className="flex min-w-0 flex-col gap-0.5">
							<span className="text-muted-foreground text-xs">
								{isAgent ? "Agent" : "Caller"} ·{" "}
								{formatDuration(Math.floor(turn.offsetMs / 1000))}
							</span>
							<p className="text-sm leading-relaxed">{turn.content}</p>
						</div>
					</div>
				);
			})}
		</div>
	);
}

function CostRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between text-sm">
			<span className="text-muted-foreground">{label}</span>
			<span className="font-mono tabular-nums">{value}</span>
		</div>
	);
}

export function CallDetail({ callId }: { callId: string }) {
	const query = useQuery(
		orpc.calls.get.queryOptions({ input: { id: callId } }),
	);
	const queryClient = useQueryClient();

	const analyze = useMutation(
		orpc.calls.analyze.mutationOptions({
			onSuccess: (result) => {
				toast.success(
					result.promoted
						? `Outcome set to ${result.outcome.toLowerCase().replaceAll("_", " ")}`
						: "Analysis saved, held for review",
					{
						description: result.optedOut
							? "Caller asked not to be contacted — number suppressed."
							: result.promoted
								? undefined
								: "Confidence was too low to move the lead automatically.",
					},
				);
				queryClient.invalidateQueries({ queryKey: orpc.calls.get.key() });
				queryClient.invalidateQueries({ queryKey: orpc.calls.list.key() });
				queryClient.invalidateQueries({ queryKey: orpc.leads.list.key() });
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (query.isPending) {
		return (
			<div className="flex flex-col gap-4">
				<Skeleton className="h-24 w-full" />
				<Skeleton className="h-64 w-full" />
			</div>
		);
	}

	if (query.isError || !query.data) {
		return (
			<Card>
				<CardContent className="flex flex-col items-center gap-2 py-10 text-center">
					<WarningIcon className="size-8 text-muted-foreground" />
					<p className="font-medium">Call not found</p>
				</CardContent>
			</Card>
		);
	}

	const { call, messages, analysis, lead, agent } = query.data;
	const turns = messages as Turn[];

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="flex flex-col gap-1">
					<h1 className="font-semibold text-2xl tracking-tight">
						{lead?.name ?? call.toNumber}
					</h1>
					<p className="font-mono text-muted-foreground text-sm">
						{call.toNumber}
						{lead?.company ? ` · ${lead.company}` : ""}
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<CallStatusBadge status={call.status} />
					<OutcomeBadge outcome={call.outcome} />
					<Badge variant="outline">{call.purpose.toLowerCase()}</Badge>
					{agent ? <Badge variant="secondary">{agent.name}</Badge> : null}
				</div>
			</div>

			<div className="grid gap-6 lg:grid-cols-3">
				<div className="flex flex-col gap-6 lg:col-span-2">
					<AudioPlayerProvider>
						<Card>
							<CardHeader>
								<CardTitle className="text-base">
									Recording &amp; transcript
								</CardTitle>
							</CardHeader>
							<CardContent className="flex flex-col gap-4">
								{call.recordingUrl ? (
									<div className="flex items-center gap-3 rounded-md border border-border p-3">
										<AudioPlayerButton
											item={{ id: call.id, src: call.recordingUrl }}
											size="icon"
											variant="outline"
										/>
										<div className="flex flex-1 flex-col gap-1">
											<AudioPlayerProgress />
											<div className="flex justify-between font-mono text-muted-foreground text-xs">
												<AudioPlayerTime />
												<AudioPlayerDuration />
											</div>
										</div>
										<AudioPlayerSpeed />
									</div>
								) : (
									<p className="rounded-md border border-border border-dashed p-3 text-muted-foreground text-sm">
										No recording available for this call.
									</p>
								)}

								<Separator />
								<TranscriptTurns turns={turns} />
							</CardContent>
						</Card>
					</AudioPlayerProvider>
				</div>

				<div className="flex flex-col gap-6">
					{analysis ? (
						<Card>
							<CardHeader>
								<div className="flex items-center justify-between gap-2">
									<CardTitle className="text-base">AI analysis</CardTitle>
									<Button
										size="sm"
										variant="ghost"
										disabled={analyze.isPending}
										onClick={() => analyze.mutate({ callId, force: true })}
									>
										<SparkleIcon className="size-4" />
										{analyze.isPending ? "Running..." : "Re-run"}
									</Button>
								</div>
							</CardHeader>
							<CardContent className="flex flex-col gap-4">
								<p className="text-sm leading-relaxed">{analysis.summary}</p>

								<div className="flex flex-col gap-2 text-sm">
									<div className="flex items-center justify-between">
										<span className="text-muted-foreground">
											Proposed outcome
										</span>
										<OutcomeBadge outcome={analysis.proposedOutcome} />
									</div>
									<div className="flex items-center justify-between">
										<span className="text-muted-foreground">Confidence</span>
										<span className="font-mono">
											{Math.round(analysis.confidence * 100)}%
										</span>
									</div>
								</div>

								{analysis.nextAction ? (
									<div className="rounded-md border border-border p-3">
										<p className="text-muted-foreground text-xs">Next action</p>
										<p className="text-sm">{analysis.nextAction}</p>
									</div>
								) : null}

								{analysis.guardrailFlags.length > 0 ? (
									<div className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
										<p className="font-medium text-destructive text-xs">
											Guardrail flags
										</p>
										{analysis.guardrailFlags.map((flag: string) => (
											<span key={flag} className="text-sm">
												{GUARDRAIL_LABELS[flag] ?? flag}
											</span>
										))}
									</div>
								) : null}
							</CardContent>
						</Card>
					) : (
						<Card>
							<CardHeader>
								<CardTitle className="text-base">AI analysis</CardTitle>
							</CardHeader>
							<CardContent className="flex flex-col items-start gap-3">
								<p className="text-muted-foreground text-sm">
									Analysis runs automatically when a call ends.
								</p>
								<Button
									size="sm"
									variant="outline"
									disabled={analyze.isPending || !call.endedAt}
									onClick={() => analyze.mutate({ callId, force: false })}
								>
									<SparkleIcon className="size-4" />
									{analyze.isPending ? "Running..." : "Run analysis"}
								</Button>
							</CardContent>
						</Card>
					)}

					<Card>
						<CardHeader>
							<CardTitle className="text-base">Cost breakdown</CardTitle>
						</CardHeader>
						<CardContent className="flex flex-col gap-2">
							<CostRow
								label="Duration"
								value={formatDuration(call.durationSeconds)}
							/>
							<CostRow
								label="Billable"
								value={formatDuration(call.billableSeconds)}
							/>
							<Separator className="my-1" />
							<CostRow
								label="Telephony"
								value={formatInr(call.telephonyCostInr)}
							/>
							<CostRow
								label="Speech-to-text"
								value={formatInr(call.sttCostInr)}
							/>
							<CostRow
								label="Text-to-speech"
								value={formatInr(call.ttsCostInr)}
							/>
							<CostRow label="LLM" value={formatInr(call.llmCostInr)} />
							<CostRow
								label="Platform"
								value={formatInr(call.platformCostInr)}
							/>
							<Separator className="my-1" />
							<div className="flex items-center justify-between font-medium text-sm">
								<span>Total</span>
								<span className="font-mono tabular-nums">
									{formatInr(call.totalCostInr)}
								</span>
							</div>
							{call.endedReason ? (
								<p className="pt-2 text-muted-foreground text-xs">
									Ended: {call.endedReason}
								</p>
							) : null}
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
