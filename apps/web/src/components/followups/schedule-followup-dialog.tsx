"use client";

import { Button } from "@doki/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@doki/ui/components/dialog";
import { Input } from "@doki/ui/components/input";
import { Label } from "@doki/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@doki/ui/components/select";
import { CalendarPlusIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

type FollowUpType = "CALL" | "EMAIL" | "TASK" | "MEETING";

const TYPES: { value: FollowUpType; label: string; hint: string }[] = [
	{
		value: "CALL",
		label: "Call back",
		hint: "Dials on the next drain, after the calling policy passes again.",
	},
	{
		value: "EMAIL",
		label: "Email",
		hint: "Recorded and settled as skipped — no email provider is connected yet.",
	},
	{
		value: "TASK",
		label: "Task",
		hint: "A reminder for a human. Settles as skipped when it comes due.",
	},
	{
		value: "MEETING",
		label: "Meeting",
		hint: "A reminder for a human. Settles as skipped when it comes due.",
	},
];

const WHEN = [
	{ value: "1", label: "In 1 hour" },
	{ value: "4", label: "In 4 hours" },
	{ value: "24", label: "Tomorrow" },
	{ value: "72", label: "In 3 days" },
	{ value: "168", label: "In a week" },
];

/**
 * Schedules a follow-up by hand.
 *
 * The same table analysis writes into, so a manual callback and an AI-decided
 * one drain through one code path — including the policy check at execution
 * time, which is why this cannot dial outside working hours by accident.
 */
export function ScheduleFollowUpDialog({
	leadId,
	leadName,
	label = "Schedule follow-up",
	variant = "outline",
}: {
	leadId?: string;
	leadName?: string | null;
	label?: string;
	variant?: "default" | "outline" | "ghost";
}) {
	const [open, setOpen] = useState(false);
	const [type, setType] = useState<FollowUpType>("CALL");
	const [inHours, setInHours] = useState("24");
	const [selectedLead, setSelectedLead] = useState<string>(leadId ?? "");
	const [agentId, setAgentId] = useState<string>("");
	const queryClient = useQueryClient();

	// Only needed when the dialog is opened without a lead in hand.
	const leads = useQuery({
		...orpc.leads.list.queryOptions({ input: { limit: 100, offset: 0 } }),
		enabled: open && !leadId,
	});
	const agents = useQuery({
		...orpc.agents.list.queryOptions(),
		enabled: open,
	});

	const activeAgents = agents.data?.filter((a) => a.status === "ACTIVE") ?? [];

	const create = useMutation(
		orpc.followUps.create.mutationOptions({
			onSuccess: () => {
				toast.success("Follow-up scheduled");
				setOpen(false);
				queryClient.invalidateQueries({ queryKey: orpc.followUps.list.key() });
				queryClient.invalidateQueries({ queryKey: orpc.leads.get.key() });
				queryClient.invalidateQueries({
					queryKey: orpc.dashboard.overview.key(),
				});
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const target = leadId ?? selectedLead;
	const activeType = TYPES.find((t) => t.value === type);

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!target) {
			toast.error("Pick a lead first");
			return;
		}
		const form = new FormData(event.currentTarget);
		create.mutate({
			leadId: target,
			type,
			inHours: Number(inHours),
			note: (form.get("note") as string)?.trim() || undefined,
			agentId: type === "CALL" && agentId ? agentId : undefined,
		});
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger render={<Button size="sm" variant={variant} />}>
				<CalendarPlusIcon className="size-4" />
				{label}
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>Schedule a follow-up</DialogTitle>
						<DialogDescription>
							{leadName
								? `For ${leadName}. Runs on the next drain once it is due.`
								: "Runs on the next drain once it is due."}
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-4 py-4">
						{!leadId ? (
							<div className="grid gap-2">
								<Label>Lead</Label>
								<Select
									value={selectedLead}
									onValueChange={(v) => setSelectedLead(v ?? "")}
								>
									<SelectTrigger>
										<SelectValue placeholder="Pick a lead" />
									</SelectTrigger>
									<SelectContent>
										{(leads.data?.leads ?? []).map((lead) => (
											<SelectItem key={lead.id} value={lead.id}>
												{lead.name ?? lead.phoneE164}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						) : null}

						<div className="grid grid-cols-2 gap-3">
							<div className="grid gap-2">
								<Label>Action</Label>
								<Select
									value={type}
									onValueChange={(v) => setType((v ?? "CALL") as FollowUpType)}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{TYPES.map((t) => (
											<SelectItem key={t.value} value={t.value}>
												{t.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="grid gap-2">
								<Label>When</Label>
								<Select
									value={inHours}
									onValueChange={(v) => setInHours(v ?? "24")}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{WHEN.map((w) => (
											<SelectItem key={w.value} value={w.value}>
												{w.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>

						{type === "CALL" ? (
							<div className="grid gap-2">
								<Label>Agent</Label>
								<Select
									value={agentId}
									onValueChange={(v) => setAgentId(v ?? "")}
									disabled={activeAgents.length === 0}
								>
									<SelectTrigger>
										<SelectValue placeholder="Use the first active agent" />
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
						) : null}

						<div className="grid gap-2">
							<Label htmlFor="note">Note</Label>
							<Input
								id="note"
								name="note"
								maxLength={300}
								placeholder="Asked to be called after 6pm"
							/>
						</div>

						<p className="text-muted-foreground text-xs">{activeType?.hint}</p>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setOpen(false)}
							disabled={create.isPending}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={create.isPending || !target}>
							{create.isPending ? "Scheduling..." : "Schedule"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
