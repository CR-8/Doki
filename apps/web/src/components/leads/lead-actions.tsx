"use client";

import { Button } from "@doki/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

/** The minimum a dialog needs to edit a lead — not the whole row. */
export type EditableLead = {
	id: string;
	name: string | null;
	company: string | null;
	email: string | null;
	source: string | null;
	status: string;
	phoneE164: string;
	consentStatus: string;
	consentSource: string | null;
	consentEvidence: string | null;
};

const LEAD_STATUSES = [
	{ value: "NEW", label: "New" },
	{ value: "ATTEMPTING_CONTACT", label: "Attempting contact" },
	{ value: "CONTACTED", label: "Contacted" },
	{ value: "QUALIFIED", label: "Qualified" },
	{ value: "MEETING_BOOKED", label: "Meeting booked" },
	{ value: "NOT_INTERESTED", label: "Not interested" },
	{ value: "UNREACHABLE", label: "Unreachable" },
] as const;

const CONSENT_STATUSES = [
	{ value: "UNKNOWN", label: "No consent on file" },
	{ value: "GRANTED", label: "Granted" },
	{ value: "REVOKED", label: "Revoked" },
	{ value: "EXPIRED", label: "Expired" },
] as const;

const CONSENT_SOURCES = [
	{ value: "WEB_FORM", label: "Website form" },
	{ value: "INBOUND_ENQUIRY", label: "Inbound enquiry" },
	{ value: "EXISTING_CUSTOMER", label: "Existing customer" },
	{ value: "IMPORT_ATTESTED", label: "Attested on import" },
	{ value: "MANUAL_ENTRY", label: "Manual entry" },
] as const;

type LeadStatus = (typeof LEAD_STATUSES)[number]["value"];
type ConsentStatus = (typeof CONSENT_STATUSES)[number]["value"];
type ConsentSource = (typeof CONSENT_SOURCES)[number]["value"];

/** Refreshes every view a lead appears in. */
function useLeadInvalidation() {
	const queryClient = useQueryClient();
	return () => {
		queryClient.invalidateQueries({ queryKey: orpc.leads.list.key() });
		queryClient.invalidateQueries({ queryKey: orpc.leads.get.key() });
		queryClient.invalidateQueries({ queryKey: orpc.dashboard.overview.key() });
	};
}

/**
 * Edits the descriptive fields of a lead.
 *
 * The phone number is shown but not editable: it is the key the suppression
 * list is matched on, so changing it here would let an opted-out person be
 * dialled again under a new row.
 */
export function EditLeadDialog({
	lead,
	open,
	onOpenChange,
}: {
	lead: EditableLead | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [status, setStatus] = useState<LeadStatus>("NEW");
	const invalidate = useLeadInvalidation();

	useEffect(() => {
		if (lead && lead.status !== "SUPPRESSED") {
			setStatus(lead.status as LeadStatus);
		}
	}, [lead]);

	const update = useMutation(
		orpc.leads.update.mutationOptions({
			onSuccess: () => {
				toast.success("Lead updated");
				onOpenChange(false);
				invalidate();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!lead) return null;
	const suppressed = lead.status === "SUPPRESSED";

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!lead) return;
		const form = new FormData(event.currentTarget);
		update.mutate({
			id: lead.id,
			name: (form.get("name") as string)?.trim() || null,
			company: (form.get("company") as string)?.trim() || null,
			email: (form.get("email") as string)?.trim() || "",
			source: (form.get("source") as string)?.trim() || null,
			...(suppressed ? {} : { status }),
		});
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>Edit lead</DialogTitle>
						<DialogDescription className="font-mono">
							{lead.phoneE164}
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-4 py-4">
						<div className="grid grid-cols-2 gap-3">
							<div className="grid gap-2">
								<Label htmlFor="edit-name">Name</Label>
								<Input
									id="edit-name"
									name="name"
									defaultValue={lead.name ?? ""}
									maxLength={200}
								/>
							</div>
							<div className="grid gap-2">
								<Label htmlFor="edit-company">Company</Label>
								<Input
									id="edit-company"
									name="company"
									defaultValue={lead.company ?? ""}
									maxLength={200}
								/>
							</div>
						</div>

						<div className="grid gap-2">
							<Label htmlFor="edit-email">Email</Label>
							<Input
								id="edit-email"
								name="email"
								type="email"
								defaultValue={lead.email ?? ""}
							/>
						</div>

						<div className="grid grid-cols-2 gap-3">
							<div className="grid gap-2">
								<Label htmlFor="edit-source">Source</Label>
								<Input
									id="edit-source"
									name="source"
									defaultValue={lead.source ?? ""}
									maxLength={120}
									placeholder="website-form"
								/>
							</div>
							<div className="grid gap-2">
								<Label>Status</Label>
								<Select
									value={suppressed ? "SUPPRESSED" : status}
									onValueChange={(v) => setStatus((v ?? "NEW") as LeadStatus)}
									disabled={suppressed}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{LEAD_STATUSES.map((s) => (
											<SelectItem key={s.value} value={s.value}>
												{s.label}
											</SelectItem>
										))}
										{suppressed ? (
											<SelectItem value="SUPPRESSED">Suppressed</SelectItem>
										) : null}
									</SelectContent>
								</Select>
							</div>
						</div>

						{suppressed ? (
							<p className="text-muted-foreground text-xs">
								This lead is suppressed. Its status cannot be changed by hand —
								someone asked not to be called, and a dropdown is not a lawful
								basis for undoing that.
							</p>
						) : null}
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
							disabled={update.isPending}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={update.isPending}>
							{update.isPending ? "Saving..." : "Save"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

/**
 * Changes consent, with provenance.
 *
 * Every change appends a consent record naming who attested it and when,
 * because "we had consent" is not an answer a regulator accepts — "obtained
 * via the website form on 12 March, attested by this user" is.
 */
export function ConsentDialog({
	lead,
	open,
	onOpenChange,
}: {
	lead: EditableLead | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [status, setStatus] = useState<ConsentStatus>("UNKNOWN");
	const [source, setSource] = useState<ConsentSource>("WEB_FORM");
	const invalidate = useLeadInvalidation();

	useEffect(() => {
		if (!lead) return;
		setStatus(lead.consentStatus as ConsentStatus);
		if (lead.consentSource) setSource(lead.consentSource as ConsentSource);
	}, [lead]);

	const setConsent = useMutation(
		orpc.leads.setConsent.mutationOptions({
			onSuccess: () => {
				toast.success("Consent recorded", {
					description: "Written to the consent trail and the audit log.",
				});
				onOpenChange(false);
				invalidate();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!lead) return null;
	const granted = status === "GRANTED";

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!lead) return;
		const form = new FormData(event.currentTarget);
		setConsent.mutate({
			leadId: lead.id,
			status,
			source: granted ? source : undefined,
			evidence: (form.get("evidence") as string)?.trim() || undefined,
		});
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>Consent</DialogTitle>
						<DialogDescription>
							Promotional calls require consent on file. Service calls to
							existing customers do not.
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-4 py-4">
						<div className="grid gap-2">
							<Label>Status</Label>
							<Select
								value={status}
								onValueChange={(v) =>
									setStatus((v ?? "UNKNOWN") as ConsentStatus)
								}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{CONSENT_STATUSES.map((s) => (
										<SelectItem key={s.value} value={s.value}>
											{s.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{granted ? (
							<div className="grid gap-2">
								<Label>How it was obtained</Label>
								<Select
									value={source}
									onValueChange={(v) =>
										setSource((v ?? "WEB_FORM") as ConsentSource)
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{CONSENT_SOURCES.map((s) => (
											<SelectItem key={s.value} value={s.value}>
												{s.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						) : null}

						<div className="grid gap-2">
							<Label htmlFor="evidence">Evidence</Label>
							<Input
								id="evidence"
								name="evidence"
								maxLength={500}
								defaultValue={lead.consentEvidence ?? ""}
								placeholder="Form submission id, recording reference, or URL"
							/>
							<p className="text-muted-foreground text-xs">
								Revoking consent stops promotional calls. It does not suppress
								the number — use opt-out for that.
							</p>
						</div>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
							disabled={setConsent.isPending}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={setConsent.isPending}>
							{setConsent.isPending ? "Recording..." : "Record consent"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

/** Hard-deletes a lead. The server refuses once the lead has call history. */
export function DeleteLeadDialog({
	lead,
	open,
	onOpenChange,
	onDeleted,
}: {
	lead: EditableLead | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onDeleted?: () => void;
}) {
	const invalidate = useLeadInvalidation();

	const remove = useMutation(
		orpc.leads.remove.mutationOptions({
			onSuccess: () => {
				toast.success("Lead deleted");
				onOpenChange(false);
				invalidate();
				onDeleted?.();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!lead) return null;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Delete this lead?</DialogTitle>
					<DialogDescription>
						{lead.name ?? lead.phoneE164} will be removed permanently, along
						with anything scheduled for them. A lead that has already been
						called cannot be deleted — opt it out instead.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={remove.isPending}
					>
						Cancel
					</Button>
					<Button
						type="button"
						variant="destructive"
						disabled={remove.isPending}
						onClick={() => remove.mutate({ id: lead.id })}
					>
						{remove.isPending ? "Deleting..." : "Delete"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
