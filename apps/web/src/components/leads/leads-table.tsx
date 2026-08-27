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
import { PhoneCallIcon, ProhibitIcon, UsersIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

import { AddLeadDialog } from "./add-lead-dialog";
import { ImportLeadsDialog } from "./import-leads-dialog";
import { PolicyBadge, type PolicyDecisionView } from "./policy-badge";

type Purpose = "SERVICE" | "PROMOTIONAL" | "TRANSACTIONAL";

const PURPOSES: { value: Purpose; label: string; hint: string }[] = [
	{
		value: "SERVICE",
		label: "Service",
		hint: "Existing customers. Consent and DND checks do not apply.",
	},
	{
		value: "PROMOTIONAL",
		label: "Promotional",
		hint: "Requires recorded consent and a fresh DND scrub. 140-series only.",
	},
	{
		value: "TRANSACTIONAL",
		label: "Transactional",
		hint: "Order and payment notifications. 1600-series.",
	},
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

export function LeadsTable() {
	const [purpose, setPurpose] = useState<Purpose>("SERVICE");
	const [agentId, setAgentId] = useState<string>("");
	const [dispatchingId, setDispatchingId] = useState<string | null>(null);
	const queryClient = useQueryClient();

	const leads = useQuery(
		orpc.leads.list.queryOptions({ input: { limit: 50, offset: 0, purpose } }),
	);
	const agents = useQuery(orpc.agents.list.queryOptions());

	const activeAgents = agents.data?.filter((a) => a.status === "ACTIVE") ?? [];
	const selectedAgent = agentId || activeAgents[0]?.id || "";

	const dispatch = useMutation(
		orpc.calls.dispatch.mutationOptions({
			onSuccess: (result) => {
				if (result.ok) {
					toast.success("Call queued", {
						description: "Track it on the Calls page.",
					});
				} else {
					// A refusal is a correct outcome, not an error — show the reason.
					toast.warning(result.reason, {
						description: result.code ? `Policy: ${result.code}` : undefined,
					});
				}
				queryClient.invalidateQueries({ queryKey: orpc.leads.list.key() });
				queryClient.invalidateQueries({ queryKey: orpc.calls.list.key() });
			},
			onError: (error) => toast.error(error.message),
			onSettled: () => setDispatchingId(null),
		}),
	);

	const optOut = useMutation(
		orpc.calls.optOut.mutationOptions({
			onSuccess: () => {
				toast.success("Lead opted out", {
					description: "Number suppressed for 90 days.",
				});
				queryClient.invalidateQueries({ queryKey: orpc.leads.list.key() });
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const activePurpose = PURPOSES.find((p) => p.value === purpose);
	const capacity = leads.data?.capacity;
	const hasAgent = activeAgents.length > 0;

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div className="flex flex-wrap items-end gap-4">
					<div className="flex flex-col gap-1">
						<span className="font-medium text-sm">Call purpose</span>
						<Select
							value={purpose}
							onValueChange={(v) => setPurpose((v ?? "SERVICE") as Purpose)}
						>
							<SelectTrigger className="w-[180px]">
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
							disabled={!hasAgent}
						>
							<SelectTrigger className="w-[200px]">
								<SelectValue placeholder="No agent yet" />
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
				</div>

				<div className="flex items-center gap-3">
					{capacity ? (
						<Card className="px-3 py-2">
							<CardContent className="flex items-center gap-4 p-0 text-xs">
								<div className="flex flex-col">
									<span className="text-muted-foreground">Concurrent</span>
									<span className="font-mono">
										{capacity.activeCalls}/{capacity.maxConcurrentCalls}
									</span>
								</div>
								<div className="flex flex-col">
									<span className="text-muted-foreground">Minutes</span>
									<span className="font-mono">
										{capacity.minutesUsed}/{capacity.monthlyMinutesCap}
									</span>
								</div>
							</CardContent>
						</Card>
					) : null}
					<ImportLeadsDialog />
					<AddLeadDialog />
				</div>
			</div>

			<p className="text-muted-foreground text-xs">{activePurpose?.hint}</p>

			{!hasAgent && !agents.isPending ? (
				<Card className="border-dashed">
					<CardContent className="flex items-center justify-between gap-4 p-4">
						<div className="flex flex-col">
							<p className="font-medium text-sm">No agent configured</p>
							<p className="text-muted-foreground text-sm">
								An agent defines what is said on the call, including the AI
								disclosure.
							</p>
						</div>
						<Button
							size="sm"
							variant="outline"
							render={<Link href="/agents" />}
						>
							Create agent
						</Button>
					</CardContent>
				</Card>
			) : null}

			<Card>
				<CardContent className="p-0">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Lead</TableHead>
								<TableHead>Phone</TableHead>
								<TableHead>Consent</TableHead>
								<TableHead className="text-center">Attempts</TableHead>
								<TableHead>Eligibility</TableHead>
								<TableHead className="text-right">Action</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{leads.isPending ? (
								<LoadingRows />
							) : leads.data && leads.data.leads.length > 0 ? (
								leads.data.leads.map((lead) => {
									const decision = lead.eligibility as PolicyDecisionView;
									const busy = dispatchingId === lead.id;
									return (
										<TableRow key={lead.id}>
											<TableCell>
												<div className="flex flex-col">
													<span className="font-medium">
														{lead.name ?? "Unnamed lead"}
													</span>
													{lead.company ? (
														<span className="text-muted-foreground text-xs">
															{lead.company}
														</span>
													) : null}
												</div>
											</TableCell>
											<TableCell className="font-mono text-sm">
												{lead.phoneE164}
											</TableCell>
											<TableCell>
												<Badge
													variant={
														CONSENT_TONE[lead.consentStatus] ?? "secondary"
													}
												>
													{lead.consentStatus.toLowerCase()}
												</Badge>
											</TableCell>
											<TableCell className="text-center font-mono text-sm">
												{lead.attemptCount}
											</TableCell>
											<TableCell>
												<PolicyBadge decision={decision} />
											</TableCell>
											<TableCell>
												<div className="flex items-center justify-end gap-2">
													<Button
														size="icon"
														variant="ghost"
														title="Opt this lead out"
														disabled={
															optOut.isPending || lead.status === "SUPPRESSED"
														}
														onClick={() => optOut.mutate({ leadId: lead.id })}
													>
														<ProhibitIcon className="size-4" />
													</Button>
													<Button
														size="sm"
														variant={decision.allowed ? "default" : "outline"}
														disabled={
															!decision.allowed || !selectedAgent || busy
														}
														onClick={() => {
															setDispatchingId(lead.id);
															dispatch.mutate({
																leadId: lead.id,
																agentId: selectedAgent,
																purpose,
															});
														}}
													>
														<PhoneCallIcon className="size-4" />
														{busy ? "Calling..." : "Call"}
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
											<UsersIcon className="size-8 text-muted-foreground" />
											<p className="font-medium">No leads yet</p>
											<p className="max-w-sm text-muted-foreground text-sm">
												Add a lead to see how the calling policy evaluates it.
											</p>
										</div>
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			{leads.data ? (
				<p className="text-muted-foreground text-xs">
					Showing {leads.data.leads.length} of {leads.data.total} leads. Every
					verdict above is written to the audit log.
				</p>
			) : null}
		</div>
	);
}

function LoadingRows() {
	return (
		<>
			{[0, 1, 2].map((i) => (
				<TableRow key={i}>
					{[0, 1, 2, 3, 4, 5].map((c) => (
						<TableCell key={c}>
							<Skeleton className="h-5 w-full" />
						</TableCell>
					))}
				</TableRow>
			))}
		</>
	);
}
