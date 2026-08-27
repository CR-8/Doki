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
import { PlusIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

const CONSENT_OPTIONS = [
	{ value: "UNKNOWN", label: "No consent on file" },
	{ value: "GRANTED", label: "Consent granted" },
] as const;

const CONSENT_SOURCES = [
	{ value: "WEB_FORM", label: "Website form" },
	{ value: "INBOUND_ENQUIRY", label: "Inbound enquiry" },
	{ value: "EXISTING_CUSTOMER", label: "Existing customer" },
	{ value: "IMPORT_ATTESTED", label: "Attested on import" },
	{ value: "MANUAL_ENTRY", label: "Manual entry" },
] as const;

export function AddLeadDialog() {
	const [open, setOpen] = useState(false);
	const [consentStatus, setConsentStatus] = useState<string>("UNKNOWN");
	const [consentSource, setConsentSource] = useState<string>("WEB_FORM");
	const queryClient = useQueryClient();

	const createLead = useMutation(
		orpc.leads.create.mutationOptions({
			onSuccess: () => {
				toast.success("Lead added");
				setOpen(false);
				setConsentStatus("UNKNOWN");
				queryClient.invalidateQueries({ queryKey: orpc.leads.list.key() });
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		const granted = consentStatus === "GRANTED";

		createLead.mutate({
			name: (form.get("name") as string)?.trim() || null,
			company: (form.get("company") as string)?.trim() || null,
			email: (form.get("email") as string)?.trim() || null,
			phone: (form.get("phone") as string)?.trim() ?? "",
			source: (form.get("source") as string)?.trim() || null,
			consentStatus: granted ? "GRANTED" : "UNKNOWN",
			consentSource: granted ? (consentSource as "WEB_FORM") : null,
			consentEvidence: granted
				? (form.get("consentEvidence") as string)?.trim() || null
				: null,
		});
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger render={<Button size="sm" />}>
				<PlusIcon className="size-4" />
				Add lead
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>Add lead</DialogTitle>
						<DialogDescription>
							Phone numbers are normalised to E.164 so duplicates and opt-outs
							are matched reliably.
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-4 py-4">
						<div className="grid gap-2">
							<Label htmlFor="phone">Phone number</Label>
							<Input
								id="phone"
								name="phone"
								required
								placeholder="98765 43210"
								autoComplete="off"
							/>
							<p className="text-muted-foreground text-xs">
								Indian numbers are assumed unless a country code is given.
							</p>
						</div>

						<div className="grid grid-cols-2 gap-3">
							<div className="grid gap-2">
								<Label htmlFor="name">Name</Label>
								<Input id="name" name="name" placeholder="Rohan Sharma" />
							</div>
							<div className="grid gap-2">
								<Label htmlFor="company">Company</Label>
								<Input id="company" name="company" placeholder="Acme Pvt Ltd" />
							</div>
						</div>

						<div className="grid grid-cols-2 gap-3">
							<div className="grid gap-2">
								<Label htmlFor="email">Email</Label>
								<Input
									id="email"
									name="email"
									type="email"
									placeholder="rohan@acme.in"
								/>
							</div>
							<div className="grid gap-2">
								<Label htmlFor="source">Source</Label>
								<Input id="source" name="source" placeholder="website-form" />
							</div>
						</div>

						<div className="grid gap-2">
							<Label>Consent</Label>
							<Select
								value={consentStatus}
								onValueChange={(v) => setConsentStatus(v ?? "UNKNOWN")}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{CONSENT_OPTIONS.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<p className="text-muted-foreground text-xs">
								Promotional calls are refused without recorded consent.
							</p>
						</div>

						{consentStatus === "GRANTED" ? (
							<div className="grid gap-3 rounded-md border border-border bg-muted/40 p-3">
								<div className="grid gap-2">
									<Label>How was consent obtained?</Label>
									<Select
										value={consentSource}
										onValueChange={(v) => setConsentSource(v ?? "WEB_FORM")}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{CONSENT_SOURCES.map((option) => (
												<SelectItem key={option.value} value={option.value}>
													{option.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="grid gap-2">
									<Label htmlFor="consentEvidence">Evidence</Label>
									<Input
										id="consentEvidence"
										name="consentEvidence"
										placeholder="https://acme.in/form-submission/1234"
									/>
									<p className="text-muted-foreground text-xs">
										A form URL, ticket reference, or recording ID. You are
										attesting this consent is genuine.
									</p>
								</div>
							</div>
						) : null}
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setOpen(false)}
							disabled={createLead.isPending}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={createLead.isPending}>
							{createLead.isPending ? "Adding..." : "Add lead"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
