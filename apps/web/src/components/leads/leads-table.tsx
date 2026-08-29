"use client";

import { Badge } from "@doki/ui/components/badge";
import { Button } from "@doki/ui/components/button";
import { Card, CardContent } from "@doki/ui/components/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@doki/ui/components/dropdown-menu";
import { Input } from "@doki/ui/components/input";
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
	CaretLeftIcon,
	CaretRightIcon,
	DotsThreeIcon,
	MagnifyingGlassIcon,
	PencilSimpleIcon,
	PhoneCallIcon,
	ProhibitIcon,
	SealCheckIcon,
	TrashIcon,
	UsersIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

import { AddLeadDialog } from "./add-lead-dialog";
import { ImportLeadsDialog } from "./import-leads-dialog";
import {
	ConsentDialog,
	DeleteLeadDialog,
	type EditableLead,
	EditLeadDialog,
} from "./lead-actions";
import { PolicyBadge, type PolicyDecisionView } from "./policy-badge";

type Purpose = "SERVICE" | "PROMOTIONAL" | "TRANSACTIONAL";

const PAGE_SIZE = 25;

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

const STATUS_FILTERS = [
	{ value: "ALL", label: "All statuses" },
	{ value: "NEW", label: "New" },
	{ value: "ATTEMPTING_CONTACT", label: "Attempting contact" },
	{ value: "CONTACTED", label: "Contacted" },
	{ value: "QUALIFIED", label: "Qualified" },
	{ value: "MEETING_BOOKED", label: "Meeting booked" },
	{ value: "NOT_INTERESTED", label: "Not interested" },
	{ value: "UNREACHABLE", label: "Unreachable" },
	{ value: "SUPPRESSED", label: "Suppressed" },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];

const CONSENT_TONE: Record<
	string,
	"default" | "secondary" | "destructive" | "outline"
> = {
	GRANTED: "outline",
	UNKNOWN: "secondary",
	REVOKED: "destructive",
	EXPIRED: "secondary",
};

/** Which controlled dialog the row menu opened, if any. */
type RowDialog = "edit" | "consent" | "delete" | null;

export function LeadsTable() {
	const [purpose, setPurpose] = useState<Purpose>("SERVICE");
	const [agentId, setAgentId] = useState<string>("");
	const [status, setStatus] = useState<StatusFilter>("ALL");
	const [searchInput, setSearchInput] = useState("");
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(0);
	const [dispatchingId, setDispatchingId] = useState<string | null>(null);
	const [activeLead, setActiveLead] = useState<EditableLead | null>(null);
	const [dialog, setDialog] = useState<RowDialog>(null);
	const queryClient = useQueryClient();

	// Debounced so typing a phone number does not fire a query per keystroke.
	useEffect(() => {
		const id = setTimeout(() => {
			setSearch(searchInput.trim());
			setPage(0);
		}, 300);
		return () => clearTimeout(id);
	}, [searchInput]);

	const leads = useQuery(
		orpc.leads.list.queryOptions({
			input: {
				limit: PAGE_SIZE,
				offset: page * PAGE_SIZE,
				purpose,
				...(search ? { search } : {}),
				...(status === "ALL" ? {} : { status }),
			},
		}),
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
				queryClient.invalidateQueries({ queryKey: orpc.leads.get.key() });
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const activePurpose = PURPOSES.find((p) => p.value === purpose);
	const capacity = leads.data?.capacity;
	const hasAgent = activeAgents.length > 0;
	const total = leads.data?.total ?? 0;
	const shown = leads.data?.leads.length ?? 0;
	const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
	const filtered = Boolean(search) || status !== "ALL";

	function openDialog(lead: EditableLead, which: Exclude<RowDialog, null>) {
		setActiveLead(lead);
		setDialog(which);
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div className="flex flex-wrap items-end gap-3">
					<div className="flex flex-col gap-1">
						<span className="font-medium text-sm">Search</span>
						<div className="relative">
							<MagnifyingGlassIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								value={searchInput}
								onChange={(e) => setSearchInput(e.target.value)}
								placeholder="Name, company, email or phone"
								className="w-[240px] pl-8"
							/>
						</div>
					</div>

					<div className="flex flex-col gap-1">
						<span className="font-medium text-sm">Status</span>
						<Select
							value={status}
							onValueChange={(v) => {
								setStatus((v ?? "ALL") as StatusFilter);
								setPage(0);
							}}
						>
							<SelectTrigger className="w-[170px]">
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

					<div className="flex flex-col gap-1">
						<span className="font-medium text-sm">Call purpose</span>
						<Select
							value={purpose}
							onValueChange={(v) => setPurpose((v ?? "SERVICE") as Purpose)}
						>
							<SelectTrigger className="w-[160px]">
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
							<SelectTrigger className="w-[180px]">
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
							nativeButton={false}
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
								<TableHead>Status</TableHead>
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

									return (
										<TableRow key={lead.id}>
											<TableCell>
												<Link
													href={`/leads/${lead.id}`}
													className="flex flex-col hover:underline"
												>
													<span className="font-medium">
														{lead.name ?? "Unnamed lead"}
													</span>
													{lead.company ? (
														<span className="text-muted-foreground text-xs">
															{lead.company}
														</span>
													) : null}
												</Link>
											</TableCell>
											<TableCell className="font-mono text-sm">
												{lead.phoneE164}
											</TableCell>
											<TableCell>
												<Badge
													variant={
														lead.status === "SUPPRESSED"
															? "destructive"
															: "secondary"
													}
												>
													{lead.status.replaceAll("_", " ").toLowerCase()}
												</Badge>
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

													<DropdownMenu>
														<DropdownMenuTrigger
															render={
																<Button
																	size="icon"
																	variant="ghost"
																	aria-label="More actions"
																/>
															}
														>
															<DotsThreeIcon className="size-4" weight="bold" />
														</DropdownMenuTrigger>
														<DropdownMenuContent align="end" className="w-52">
															<DropdownMenuItem
																render={<Link href={`/leads/${lead.id}`} />}
															>
																<UsersIcon className="size-4" />
																<span>Open lead</span>
															</DropdownMenuItem>
															<DropdownMenuItem
																onClick={() => openDialog(editable, "edit")}
															>
																<PencilSimpleIcon className="size-4" />
																<span>Edit details</span>
															</DropdownMenuItem>
															<DropdownMenuItem
																onClick={() => openDialog(editable, "consent")}
															>
																<SealCheckIcon className="size-4" />
																<span>Consent</span>
															</DropdownMenuItem>
															<DropdownMenuSeparator />
															<DropdownMenuItem
																disabled={
																	optOut.isPending ||
																	lead.status === "SUPPRESSED"
																}
																onClick={() =>
																	optOut.mutate({ leadId: lead.id })
																}
															>
																<ProhibitIcon className="size-4" />
																<span>Opt out</span>
															</DropdownMenuItem>
															<DropdownMenuItem
																variant="destructive"
																onClick={() => openDialog(editable, "delete")}
															>
																<TrashIcon className="size-4" />
																<span>Delete</span>
															</DropdownMenuItem>
														</DropdownMenuContent>
													</DropdownMenu>
												</div>
											</TableCell>
										</TableRow>
									);
								})
							) : (
								<TableRow>
									<TableCell colSpan={7}>
										<div className="flex flex-col items-center gap-2 py-10 text-center">
											<UsersIcon className="size-8 text-muted-foreground" />
											<p className="font-medium">
												{filtered ? "Nothing matches" : "No leads yet"}
											</p>
											<p className="max-w-sm text-muted-foreground text-sm">
												{filtered
													? "Try a different search term or clear the status filter."
													: "Add a lead to see how the calling policy evaluates it."}
											</p>
										</div>
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			<div className="flex flex-wrap items-center justify-between gap-3">
				<p className="text-muted-foreground text-xs">
					{total > 0
						? `Showing ${page * PAGE_SIZE + 1}–${page * PAGE_SIZE + shown} of ${total}. Every verdict above is written to the audit log.`
						: "Every verdict is written to the audit log."}
				</p>
				{lastPage > 0 ? (
					<div className="flex items-center gap-2">
						<Button
							size="sm"
							variant="outline"
							disabled={page === 0 || leads.isFetching}
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
							disabled={page >= lastPage || leads.isFetching}
							onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
						>
							Next
							<CaretRightIcon className="size-4" />
						</Button>
					</div>
				) : null}
			</div>

			<EditLeadDialog
				lead={activeLead}
				open={dialog === "edit"}
				onOpenChange={(next) => setDialog(next ? "edit" : null)}
			/>
			<ConsentDialog
				lead={activeLead}
				open={dialog === "consent"}
				onOpenChange={(next) => setDialog(next ? "consent" : null)}
			/>
			<DeleteLeadDialog
				lead={activeLead}
				open={dialog === "delete"}
				onOpenChange={(next) => setDialog(next ? "delete" : null)}
			/>
		</div>
	);
}

function LoadingRows() {
	return (
		<>
			{[0, 1, 2].map((i) => (
				<TableRow key={i}>
					{[0, 1, 2, 3, 4, 5, 6].map((c) => (
						<TableCell key={c}>
							<Skeleton className="h-5 w-full" />
						</TableCell>
					))}
				</TableRow>
			))}
		</>
	);
}
