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
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@doki/ui/components/tabs";
import {
	PencilSimpleIcon,
	PhoneCallIcon,
	ProhibitIcon,
	SealCheckIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

import {
	CallStatusBadge,
	formatDuration,
	formatInr,
	OutcomeBadge,
} from "../calls/call-status-badge";
import { ScheduleFollowUpDialog } from "../followups/schedule-followup-dialog";
import {
	ConsentDialog,
	type EditableLead,
	EditLeadDialog,
} from "./lead-actions";
import { PolicyBadge, type PolicyDecisionView } from "./policy-badge";

type Purpose = "SERVICE" | "PROMOTIONAL" | "TRANSACTIONAL";

const PURPOSES: { value: Purpose; label: string }[] = [
	{ value: "SERVICE", label: "Service" },
	{ value: "PROMOTIONAL", label: "Promotional" },
	{ value: "TRANSACTIONAL", label: "Transactional" },
];

const CONSENT_TONE: Record<
	string,
	"default" | "secondary" | "destructive" | "outline"
> = {
	GRANTED: "outline",
	UNKNOWN: "secondary",
	REVOKED: "destructive",
	EXPIRED: "secondary",
};

const FOLLOWUP_TONE: Record<
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

function formatWhen(value: string | Date | null): string {
	if (!value) return "—";
	return new Date(value).toLocaleString(undefined, {
		day: "2-digit",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-0.5">
			<span className="text-muted-foreground text-xs">{label}</span>
			<span className="text-sm">{value}</span>
		</div>
	);
}

/**
 * Everything about one lead on one screen.
 *
 * The eligibility card shows the verdict for all three call purposes at once,
 * because "blocked for promotional, allowed for service" is the question people
 * actually have when a call refuses to go out.
 */
export function LeadDetail({ leadId }: { leadId: string }) {
	const [purpose, setPurpose] = useState<Purpose>("SERVICE");
	const [agentId, setAgentId] = useState<string>("");
	const [dialog, setDialog] = useState<"edit" | "consent" | null>(null);
	const queryClient = useQueryClient();

	const detail = useQuery(
		orpc.leads.get.queryOptions({ input: { id: leadId } }),
	);
	const agents = useQuery(orpc.agents.list.queryOptions());
	const activeAgents = agents.data?.filter((a) => a.status === "ACTIVE") ?? [];
	const selectedAgent = agentId || activeAgents[0]?.id || "";

	const invalidate = () => {
		queryClient.invalidateQueries({ queryKey: orpc.leads.get.key() });
		queryClient.invalidateQueries({ queryKey: orpc.leads.list.key() });
		queryClient.invalidateQueries({ queryKey: orpc.calls.list.key() });
	};

	const dispatch = useMutation(
		orpc.calls.dispatch.mutationOptions({
			onSuccess: (result) => {
				if (result.ok) {
					toast.success("Call queued", { description: "Tracking it below." });
				} else {
					toast.warning(result.reason, {
						description: result.code ? `Policy: ${result.code}` : undefined,
					});
				}
				invalidate();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const optOut = useMutation(
		orpc.calls.optOut.mutationOptions({
			onSuccess: () => {
				toast.success("Lead opted out", {
					description: "Number suppressed for 90 days.",
				});
				invalidate();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (detail.isPending) {
		return (
			<div className="flex flex-col gap-4">
				<Skeleton className="h-28 w-full" />
				<Skeleton className="h-24 w-full" />
				<Skeleton className="h-64 w-full" />
			</div>
		);
	}

	if (detail.isError || !detail.data) {
		return (
			<Card>
				<CardContent className="flex flex-col items-center gap-2 py-12 text-center">
					<WarningIcon className="size-8 text-muted-foreground" />
					<p className="font-medium">Lead not found</p>
					<Button
						size="sm"
						variant="outline"
						nativeButton={false}
						render={<Link href="/leads" />}
					>
						Back to leads
					</Button>
				</CardContent>
			</Card>
		);
	}

	const { lead, eligibility, suppression, calls, followUps, consentHistory } =
		detail.data;

	const editable: EditableLead = {
		id: lead.id,
		name: lead.name,
		company: lead.company,
		email: lead.email,
		source: lead.source,
		status: lead.status,
		phoneE164: lead.phoneE164,
		consentStatus: lead.consentStatus,
		consentSource: lead.consentSource,
		consentEvidence: lead.consentEvidence,
	};

	const decision = eligibility[purpose] as PolicyDecisionView;
	const suppressed = lead.status === "SUPPRESSED";

	return (
		<div className="flex flex-col gap-4">
			<Card>
				<CardHeader>
					<div className="flex flex-wrap items-start justify-between gap-4">
						<div className="flex flex-col gap-1">
							<CardTitle className="text-2xl">
								{lead.name ?? "Unnamed lead"}
							</CardTitle>
							<CardDescription className="font-mono">
								{lead.phoneE164}
								{lead.company ? ` · ${lead.company}` : ""}
							</CardDescription>
							<div className="flex flex-wrap items-center gap-2 pt-1">
								<Badge variant={suppressed ? "destructive" : "secondary"}>
									{lead.status.replaceAll("_", " ").toLowerCase()}
								</Badge>
								<Badge
									variant={CONSENT_TONE[lead.consentStatus] ?? "secondary"}
								>
									consent: {lead.consentStatus.toLowerCase()}
								</Badge>
								<Badge variant="outline">{lead.timezone}</Badge>
							</div>
						</div>

						<div className="flex flex-wrap items-center gap-2">
							<ScheduleFollowUpDialog
								leadId={lead.id}
								leadName={lead.name ?? lead.phoneE164}
							/>
							<Button
								size="sm"
								variant="outline"
								onClick={() => setDialog("consent")}
							>
								<SealCheckIcon className="size-4" />
								Consent
							</Button>
							<Button
								size="sm"
								variant="outline"
								onClick={() => setDialog("edit")}
							>
								<PencilSimpleIcon className="size-4" />
								Edit
							</Button>
							<Button
								size="sm"
								variant="outline"
								disabled={optOut.isPending || suppressed}
								onClick={() => optOut.mutate({ leadId: lead.id })}
							>
								<ProhibitIcon className="size-4" />
								Opt out
							</Button>
						</div>
					</div>
				</CardHeader>

				<CardContent className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
					<Fact label="Email" value={lead.email ?? "—"} />
					<Fact label="Source" value={lead.source ?? "—"} />
					<Fact label="Attempts" value={lead.attemptCount} />
					<Fact label="Last attempt" value={formatWhen(lead.lastAttemptAt)} />
					<Fact label="Added" value={formatWhen(lead.createdAt)} />
				</CardContent>
			</Card>

			{suppression ? (
				<Card className="border-destructive/40">
					<CardContent className="flex items-start gap-3 p-4">
						<ProhibitIcon className="mt-0.5 size-5 text-destructive" />
						<div className="flex flex-col gap-1">
							<p className="font-medium text-sm">
								Suppressed —{" "}
								{suppression.reason.replaceAll("_", " ").toLowerCase()}
							</p>
							<p className="text-muted-foreground text-sm">
								{suppression.notes ?? "No note recorded."}
							</p>
							<p className="text-muted-foreground text-xs">
								In force since {formatWhen(suppression.createdAt)}
								{suppression.suppressedUntil
									? ` · until ${formatWhen(suppression.suppressedUntil)}`
									: " · no expiry"}
							</p>
						</div>
					</CardContent>
				</Card>
			) : null}

			<Card>
				<CardHeader>
					<CardTitle className="text-base">Can we call this lead?</CardTitle>
					<CardDescription>
						The same evaluation dispatch runs, for every purpose.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<div className="grid gap-3 sm:grid-cols-3">
						{PURPOSES.map((p) => (
							<div
								key={p.value}
								className="flex flex-col gap-2 rounded-md border border-border p-3"
							>
								<span className="font-medium text-sm">{p.label}</span>
								<PolicyBadge
									decision={eligibility[p.value] as PolicyDecisionView}
								/>
							</div>
						))}
					</div>

					<div className="flex flex-wrap items-end gap-3 border-border border-t pt-4">
						<div className="flex flex-col gap-1">
							<span className="font-medium text-sm">Purpose</span>
							<Select
								value={purpose}
								onValueChange={(v) => setPurpose((v ?? "SERVICE") as Purpose)}
							>
								<SelectTrigger className="w-[170px]">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{PURPOSES.map((p) => (
										<SelectItem key={p.value} value={p.value}>
											{p.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-1">
							<span className="font-medium text-sm">Agent</span>
							<Select
								value={selectedAgent}
								onValueChange={(v) => setAgentId(v ?? "")}
								disabled={activeAgents.length === 0}
							>
								<SelectTrigger className="w-[200px]">
									<SelectValue placeholder="No active agent" />
								</SelectTrigger>
								<SelectContent>
									{activeAgents.map((a) => (
										<SelectItem key={a.id} value={a.id}>
											{a.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<Button
							disabled={
								!decision.allowed || !selectedAgent || dispatch.isPending
							}
							onClick={() =>
								dispatch.mutate({
									leadId: lead.id,
									agentId: selectedAgent,
									purpose,
								})
							}
						>
							<PhoneCallIcon className="size-4" />
							{dispatch.isPending ? "Calling..." : "Call now"}
						</Button>
					</div>
				</CardContent>
			</Card>

			<Tabs defaultValue="calls">
				<TabsList>
					<TabsTrigger value="calls">Calls ({calls.length})</TabsTrigger>
					<TabsTrigger value="followups">
						Follow-ups ({followUps.length})
					</TabsTrigger>
					<TabsTrigger value="consent">
						Consent trail ({consentHistory.length})
					</TabsTrigger>
				</TabsList>

				<TabsContent value="calls">
					<Card>
						<CardContent className="p-0">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>When</TableHead>
										<TableHead>Status</TableHead>
										<TableHead>Outcome</TableHead>
										<TableHead>Agent</TableHead>
										<TableHead className="text-right">Duration</TableHead>
										<TableHead className="text-right">Cost</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{calls.length > 0 ? (
										calls.map((call) => (
											<TableRow key={call.id}>
												<TableCell>
													<Link
														href={`/calls/${call.id}`}
														className="flex flex-col hover:underline"
													>
														<span className="text-sm">
															{formatWhen(call.createdAt)}
														</span>
														<span className="text-muted-foreground text-xs">
															attempt {call.attempt} ·{" "}
															{call.purpose.toLowerCase()}
														</span>
													</Link>
												</TableCell>
												<TableCell>
													<CallStatusBadge status={call.status} />
												</TableCell>
												<TableCell>
													<div className="flex flex-col gap-1">
														<OutcomeBadge outcome={call.outcome} />
														{call.summary ? (
															<span className="max-w-xs text-muted-foreground text-xs">
																{call.summary}
															</span>
														) : null}
													</div>
												</TableCell>
												<TableCell className="text-sm">
													{call.agentName ?? "—"}
												</TableCell>
												<TableCell className="text-right font-mono text-sm">
													{formatDuration(call.billableSeconds)}
												</TableCell>
												<TableCell className="text-right font-mono text-sm">
													{formatInr(call.totalCostInr)}
												</TableCell>
											</TableRow>
										))
									) : (
										<TableRow>
											<TableCell colSpan={6}>
												<p className="py-8 text-center text-muted-foreground text-sm">
													This lead has never been called.
												</p>
											</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="followups">
					<Card>
						<CardContent className="p-0">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Action</TableHead>
										<TableHead>Due</TableHead>
										<TableHead>Status</TableHead>
										<TableHead>Why</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{followUps.length > 0 ? (
										followUps.map((action) => (
											<TableRow key={action.id}>
												<TableCell>
													<div className="flex flex-col gap-1">
														<Badge variant="outline">
															{action.type.toLowerCase()}
														</Badge>
														<span className="text-muted-foreground text-xs">
															{action.source.toLowerCase()}
															{action.agentName ? ` · ${action.agentName}` : ""}
														</span>
													</div>
												</TableCell>
												<TableCell className="text-sm">
													{formatWhen(action.dueAt)}
												</TableCell>
												<TableCell>
													<Badge
														variant={
															FOLLOWUP_TONE[action.status] ?? "secondary"
														}
													>
														{action.status.toLowerCase()}
													</Badge>
												</TableCell>
												<TableCell className="max-w-xs">
													<span className="text-sm">{action.note ?? "—"}</span>
													{action.lastError ? (
														<p className="text-muted-foreground text-xs">
															{action.lastError}
														</p>
													) : null}
												</TableCell>
											</TableRow>
										))
									) : (
										<TableRow>
											<TableCell colSpan={4}>
												<p className="py-8 text-center text-muted-foreground text-sm">
													Nothing scheduled for this lead.
												</p>
											</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="consent">
					<Card>
						<CardContent className="p-0">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>When</TableHead>
										<TableHead>Status</TableHead>
										<TableHead>How</TableHead>
										<TableHead>Evidence</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{consentHistory.length > 0 ? (
										consentHistory.map((record) => (
											<TableRow key={record.id}>
												<TableCell className="text-sm">
													{formatWhen(record.occurredAt)}
												</TableCell>
												<TableCell>
													<Badge
														variant={CONSENT_TONE[record.status] ?? "secondary"}
													>
														{record.status.toLowerCase()}
													</Badge>
												</TableCell>
												<TableCell className="text-sm">
													{record.source.replaceAll("_", " ").toLowerCase()}
												</TableCell>
												<TableCell className="max-w-sm text-sm">
													{record.evidence ?? "—"}
												</TableCell>
											</TableRow>
										))
									) : (
										<TableRow>
											<TableCell colSpan={4}>
												<p className="py-8 text-center text-muted-foreground text-sm">
													No consent has been recorded for this lead.
													Promotional calls will be refused.
												</p>
											</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>

			<EditLeadDialog
				lead={editable}
				open={dialog === "edit"}
				onOpenChange={(next) => setDialog(next ? "edit" : null)}
			/>
			<ConsentDialog
				lead={editable}
				open={dialog === "consent"}
				onOpenChange={(next) => setDialog(next ? "consent" : null)}
			/>
		</div>
	);
}
