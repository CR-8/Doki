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
import { Skeleton } from "@doki/ui/components/skeleton";
import { Textarea } from "@doki/ui/components/textarea";
import { PlusIcon, RobotIcon, ShieldCheckIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

const LANGUAGES = [
	{ value: "hi-en", label: "Hinglish (Hindi + English)" },
	{ value: "hi-IN", label: "Hindi" },
	{ value: "en-IN", label: "English (India)" },
];

const PURPOSES = [
	{ value: "SERVICE", label: "Service" },
	{ value: "PROMOTIONAL", label: "Promotional" },
	{ value: "TRANSACTIONAL", label: "Transactional" },
];

const DEFAULT_DISCLOSURE =
	"Namaste, main {{business_name}} ki AI assistant bol rahi hoon.";

function CreateAgentDialog() {
	const [open, setOpen] = useState(false);
	const [language, setLanguage] = useState("hi-en");
	const [purpose, setPurpose] = useState("SERVICE");
	const queryClient = useQueryClient();

	const create = useMutation(
		orpc.agents.create.mutationOptions({
			onSuccess: () => {
				toast.success("Agent created");
				setOpen(false);
				queryClient.invalidateQueries({ queryKey: orpc.agents.list.key() });
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		create.mutate({
			name: String(form.get("name") ?? "").trim(),
			objective: String(form.get("objective") ?? "").trim(),
			instructions: String(form.get("instructions") ?? "").trim(),
			aiDisclosure: String(form.get("aiDisclosure") ?? "").trim(),
			language,
			callPurpose: purpose as "SERVICE",
			maxCallSeconds: Number(form.get("maxCallSeconds") ?? 300),
		});
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger render={<Button size="sm" />}>
				<PlusIcon className="size-4" />
				New agent
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>New agent</DialogTitle>
						<DialogDescription>
							An agent defines what gets said on the call and what must never be
							said.
						</DialogDescription>
					</DialogHeader>

					<div className="grid max-h-[60vh] gap-4 overflow-y-auto py-4">
						<div className="grid grid-cols-2 gap-3">
							<div className="grid gap-2">
								<Label htmlFor="name">Agent name</Label>
								<Input
									id="name"
									name="name"
									required
									placeholder="Renewal reminders"
								/>
							</div>
							<div className="grid gap-2">
								<Label htmlFor="maxCallSeconds">
									Max call length (seconds)
								</Label>
								<Input
									id="maxCallSeconds"
									name="maxCallSeconds"
									type="number"
									min={30}
									max={1800}
									defaultValue={300}
								/>
							</div>
						</div>

						<div className="grid grid-cols-2 gap-3">
							<div className="grid gap-2">
								<Label>Language</Label>
								<Select
									value={language}
									onValueChange={(v) => setLanguage(v ?? "hi-en")}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{LANGUAGES.map((l) => (
											<SelectItem key={l.value} value={l.value}>
												{l.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="grid gap-2">
								<Label>Call purpose</Label>
								<Select
									value={purpose}
									onValueChange={(v) => setPurpose(v ?? "SERVICE")}
								>
									<SelectTrigger>
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
						</div>

						<div className="grid gap-2 rounded-md border border-border bg-muted/40 p-3">
							<div className="flex items-center gap-2">
								<ShieldCheckIcon className="size-4" />
								<Label htmlFor="aiDisclosure">AI disclosure (required)</Label>
							</div>
							<Input
								id="aiDisclosure"
								name="aiDisclosure"
								required
								minLength={10}
								defaultValue={DEFAULT_DISCLOSURE}
							/>
							<p className="text-muted-foreground text-xs">
								Spoken as the very first thing on every call. Dispatch refuses
								to dial without it. Use <code>{"{{business_name}}"}</code> for
								your workspace name.
							</p>
						</div>

						<div className="grid gap-2">
							<Label htmlFor="objective">Objective</Label>
							<Input
								id="objective"
								name="objective"
								required
								placeholder="Confirm the renewal date and book a callback if interested"
							/>
						</div>

						<div className="grid gap-2">
							<Label htmlFor="instructions">Brief</Label>
							<Textarea
								id="instructions"
								name="instructions"
								required
								rows={6}
								placeholder={
									"You are calling existing customers about their policy renewal.\nBe warm and brief. Confirm you are speaking to the right person.\nIf interested, offer a callback from a human advisor."
								}
							/>
							<p className="text-muted-foreground text-xs">
								Pricing, legal commitments and human-escalation rules are
								enforced separately as guardrails — you do not need to repeat
								them here.
							</p>
						</div>
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
						<Button type="submit" disabled={create.isPending}>
							{create.isPending ? "Creating..." : "Create agent"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export function AgentsManager() {
	const agents = useQuery(orpc.agents.list.queryOptions());

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-end">
				<CreateAgentDialog />
			</div>

			{agents.isPending ? (
				<div className="grid gap-3 sm:grid-cols-2">
					<Skeleton className="h-40 w-full" />
					<Skeleton className="h-40 w-full" />
				</div>
			) : agents.data && agents.data.length > 0 ? (
				<div className="grid gap-3 sm:grid-cols-2">
					{agents.data.map((agent) => (
						<Card key={agent.id}>
							<CardHeader>
								<div className="flex items-start justify-between gap-2">
									<div className="flex flex-col gap-1">
										<CardTitle className="text-base">{agent.name}</CardTitle>
										<CardDescription>{agent.objective}</CardDescription>
									</div>
									<Badge
										variant={
											agent.status === "ACTIVE" ? "default" : "secondary"
										}
									>
										{agent.status.toLowerCase()}
									</Badge>
								</div>
							</CardHeader>
							<CardContent className="flex flex-col gap-3">
								<div className="flex flex-wrap gap-2">
									<Badge variant="outline">{agent.language}</Badge>
									<Badge variant="outline">
										{agent.callPurpose.toLowerCase()}
									</Badge>
									<Badge variant="outline">{agent.maxCallSeconds}s max</Badge>
								</div>
								<div className="rounded-md border border-border p-2">
									<p className="text-muted-foreground text-xs">
										Opens every call with
									</p>
									<p className="text-sm">{agent.aiDisclosure}</p>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			) : (
				<Card>
					<CardContent className="flex flex-col items-center gap-2 py-12 text-center">
						<RobotIcon className="size-8 text-muted-foreground" />
						<p className="font-medium">No agents yet</p>
						<p className="max-w-sm text-muted-foreground text-sm">
							Create an agent to define what is said on your calls.
						</p>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
