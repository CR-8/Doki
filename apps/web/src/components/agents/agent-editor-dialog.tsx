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
import { Switch } from "@doki/ui/components/switch";
import { Textarea } from "@doki/ui/components/textarea";
import {
	PlusIcon,
	ShieldCheckIcon,
	TrashIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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

export const DEFAULT_DISCLOSURE =
	"नमस्ते, मैं {{business_name}} की AI assistant बोल रही हूँ।";

type Faq = { question: string; answer: string };

type Guardrails = {
	forbiddenTopics: string[];
	neverQuotePricing: boolean;
	mustAdmitAiIfAsked: boolean;
	escalateOn: string[];
	maxWordsPerTurn: number;
};

/** What the dialog needs to prefill. Matches a row from `agents.list`. */
export type EditableAgent = {
	id: string;
	name: string;
	objective: string;
	instructions: string;
	aiDisclosure: string;
	language: string;
	callPurpose: string;
	maxCallSeconds: number;
	voiceId: string | null;
	faqs: Faq[];
	guardrails: Guardrails;
};

const DEFAULT_GUARDRAILS: Guardrails = {
	forbiddenTopics: [],
	neverQuotePricing: true,
	mustAdmitAiIfAsked: true,
	escalateOn: [],
	maxWordsPerTurn: 45,
};

function parseList(value: string): string[] {
	return value
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean)
		.slice(0, 20);
}

/**
 * Creates or edits an agent.
 *
 * One component for both because the fields are identical — an edit form that
 * drifts from the create form is how an agent ends up with guardrails that
 * only exist on paper.
 */
export function AgentEditorDialog({
	agent,
	open,
	onOpenChange,
}: {
	/** null means "create a new one". */
	agent: EditableAgent | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const isEdit = agent !== null;
	const [language, setLanguage] = useState("hi-en");
	const [purpose, setPurpose] = useState("SERVICE");
	const [faqs, setFaqs] = useState<Faq[]>([]);
	const [guardrails, setGuardrails] = useState<Guardrails>(DEFAULT_GUARDRAILS);
	const [voiceId, setVoiceId] = useState("");
	const queryClient = useQueryClient();

	// The roster belongs to the TTS model, so it is fetched rather than listed
	// here — see the comment on the `voices` procedure.
	const catalogue = useQuery({
		...orpc.agents.voices.queryOptions(),
		enabled: open,
	});
	const voices = catalogue.data?.voices ?? [];
	const defaultVoice = catalogue.data?.defaultVoice ?? "";

	// Reset on every open so a stale draft never leaks into the next agent.
	useEffect(() => {
		if (!open) return;
		setLanguage(agent?.language ?? "hi-en");
		setPurpose(agent?.callPurpose ?? "SERVICE");
		setFaqs(agent?.faqs ?? []);
		setGuardrails(agent?.guardrails ?? DEFAULT_GUARDRAILS);
		setVoiceId(agent?.voiceId ?? "");
	}, [open, agent]);

	const onDone = (message: string) => {
		toast.success(message);
		onOpenChange(false);
		queryClient.invalidateQueries({ queryKey: orpc.agents.list.key() });
		queryClient.invalidateQueries({ queryKey: orpc.dashboard.overview.key() });
	};

	const create = useMutation(
		orpc.agents.create.mutationOptions({
			onSuccess: () => onDone("Agent created"),
			onError: (error) => toast.error(error.message),
		}),
	);

	const update = useMutation(
		orpc.agents.update.mutationOptions({
			onSuccess: () => onDone("Agent updated"),
			onError: (error) => toast.error(error.message),
		}),
	);

	const pending = create.isPending || update.isPending;

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);

		// An FAQ with only half of it filled in is a prompt-injection surface,
		// not a helpful answer — drop it rather than sending a blank to the model.
		const cleanFaqs = faqs.filter(
			(faq) => faq.question.trim() && faq.answer.trim(),
		);

		const shared = {
			name: String(form.get("name") ?? "").trim(),
			objective: String(form.get("objective") ?? "").trim(),
			instructions: String(form.get("instructions") ?? "").trim(),
			aiDisclosure: String(form.get("aiDisclosure") ?? "").trim(),
			language,
			callPurpose: purpose as "SERVICE",
			maxCallSeconds: Number(form.get("maxCallSeconds") ?? 300),
			// Empty means "use the workspace default", which the synthesiser
			// resolves at call time — not a voice literal frozen in here.
			voiceId: voiceId || null,
			faqs: cleanFaqs,
			guardrails,
		};

		if (agent) update.mutate({ id: agent.id, ...shared });
		else create.mutate(shared);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-2xl">
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>{isEdit ? "Edit agent" : "New agent"}</DialogTitle>
						<DialogDescription>
							An agent defines what gets said on the call and what must never be
							said.
						</DialogDescription>
					</DialogHeader>

					<div className="grid max-h-[62vh] gap-4 overflow-y-auto py-4 pr-1">
						<div className="grid grid-cols-2 gap-3">
							<div className="grid gap-2">
								<Label htmlFor="agent-name">Agent name</Label>
								<Input
									id="agent-name"
									name="name"
									required
									defaultValue={agent?.name ?? ""}
									placeholder="Renewal reminders"
								/>
							</div>
							<div className="grid gap-2">
								<Label htmlFor="agent-max">Max call length (seconds)</Label>
								<Input
									id="agent-max"
									name="maxCallSeconds"
									type="number"
									min={30}
									max={1800}
									defaultValue={agent?.maxCallSeconds ?? 300}
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

						<div className="grid gap-2">
							<Label>Voice</Label>
							<Select
								value={voiceId}
								onValueChange={(v) => setVoiceId(v ?? "")}
								disabled={voices.length === 0}
							>
								<SelectTrigger>
									<SelectValue
										placeholder={
											catalogue.isPending
												? "Loading voices..."
												: `Workspace default (${defaultVoice})`
										}
									/>
								</SelectTrigger>
								<SelectContent>
									{voices.map((voice) => (
										<SelectItem key={voice.id} value={voice.id}>
											{voice.label}
											<span className="text-muted-foreground">
												{voice.gender}
											</span>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<p className="text-muted-foreground text-xs">
								{voiceId
									? "Used for every call this agent places."
									: `Leave unset to use the workspace default (${defaultVoice || "none configured"}).`}
								{catalogue.data ? ` Voices for ${catalogue.data.model}.` : ""}
							</p>
						</div>

						<div className="grid gap-2 rounded-md border border-border bg-muted/40 p-3">
							<div className="flex items-center gap-2">
								<ShieldCheckIcon className="size-4" />
								<Label htmlFor="agent-disclosure">
									AI disclosure (required)
								</Label>
							</div>
							<Input
								id="agent-disclosure"
								name="aiDisclosure"
								required
								minLength={10}
								defaultValue={agent?.aiDisclosure ?? DEFAULT_DISCLOSURE}
							/>
							<p className="text-muted-foreground text-xs">
								Spoken as the very first thing on every call. Dispatch refuses
								to dial without it. Use <code>{"{{business_name}}"}</code> for
								your workspace name.
							</p>
						</div>

						<div className="grid gap-2">
							<Label htmlFor="agent-objective">Objective</Label>
							<Input
								id="agent-objective"
								name="objective"
								required
								defaultValue={agent?.objective ?? ""}
								placeholder="Confirm the renewal date and book a callback if interested"
							/>
						</div>

						<div className="grid gap-2">
							<Label htmlFor="agent-instructions">Brief</Label>
							<Textarea
								id="agent-instructions"
								name="instructions"
								required
								rows={6}
								defaultValue={agent?.instructions ?? ""}
								placeholder={
									"You are calling existing customers about their policy renewal.\nBe warm and brief. Confirm you are speaking to the right person.\nIf interested, offer a callback from a human advisor."
								}
							/>
						</div>

						{/* ---- FAQs ---------------------------------------------------- */}
						<div className="grid gap-3 rounded-md border border-border p-3">
							<div className="flex items-center justify-between">
								<div className="flex flex-col">
									<Label>Answers the agent may give</Label>
									<span className="text-muted-foreground text-xs">
										Anything not listed here, it will not invent.
									</span>
								</div>
								<Button
									type="button"
									size="sm"
									variant="outline"
									disabled={faqs.length >= 30}
									onClick={() =>
										setFaqs((prev) => [...prev, { question: "", answer: "" }])
									}
								>
									<PlusIcon className="size-4" />
									Add
								</Button>
							</div>

							{faqs.length === 0 ? (
								<p className="text-muted-foreground text-xs">
									No scripted answers yet.
								</p>
							) : (
								faqs.map((faq, index) => (
									// Index is a safe key here: every field is controlled from
									// state, so a removal re-renders correct values regardless.
									<div
										key={index}
										className="grid gap-2 border-border border-t pt-3"
									>
										<div className="flex items-start gap-2">
											<Input
												value={faq.question}
												maxLength={300}
												placeholder="Question the customer might ask"
												onChange={(e) =>
													setFaqs((prev) =>
														prev.map((item, i) =>
															i === index
																? { ...item, question: e.target.value }
																: item,
														),
													)
												}
											/>
											<Button
												type="button"
												size="icon"
												variant="ghost"
												aria-label="Remove answer"
												onClick={() =>
													setFaqs((prev) => prev.filter((_, i) => i !== index))
												}
											>
												<TrashIcon className="size-4" />
											</Button>
										</div>
										<Textarea
											value={faq.answer}
											rows={2}
											maxLength={1200}
											placeholder="Exactly what it should say back"
											onChange={(e) =>
												setFaqs((prev) =>
													prev.map((item, i) =>
														i === index
															? { ...item, answer: e.target.value }
															: item,
													),
												)
											}
										/>
									</div>
								))
							)}
						</div>

						{/* ---- Guardrails ---------------------------------------------- */}
						<div className="grid gap-3 rounded-md border border-border p-3">
							<div className="flex items-center gap-2">
								<WarningIcon className="size-4" />
								<Label>Guardrails</Label>
							</div>

							<div className="flex items-center justify-between gap-4">
								<div className="flex flex-col">
									<span className="text-sm">Never quote pricing</span>
									<span className="text-muted-foreground text-xs">
										A quoted price on a recorded call is a commitment.
									</span>
								</div>
								<Switch
									checked={guardrails.neverQuotePricing}
									onCheckedChange={(checked) =>
										setGuardrails((g) => ({
											...g,
											neverQuotePricing: Boolean(checked),
										}))
									}
								/>
							</div>

							<div className="flex items-center justify-between gap-4">
								<div className="flex flex-col">
									<span className="text-sm">Admit it is an AI if asked</span>
									<span className="text-muted-foreground text-xs">
										Denying it is the fastest route to a complaint.
									</span>
								</div>
								<Switch
									checked={guardrails.mustAdmitAiIfAsked}
									onCheckedChange={(checked) =>
										setGuardrails((g) => ({
											...g,
											mustAdmitAiIfAsked: Boolean(checked),
										}))
									}
								/>
							</div>

							<div className="grid gap-2">
								<Label htmlFor="agent-forbidden">
									Forbidden topics (comma separated)
								</Label>
								<Input
									id="agent-forbidden"
									value={guardrails.forbiddenTopics.join(", ")}
									placeholder="refunds, legal advice, competitor comparisons"
									onChange={(e) =>
										setGuardrails((g) => ({
											...g,
											forbiddenTopics: parseList(e.target.value),
										}))
									}
								/>
							</div>

							<div className="grid grid-cols-2 gap-3">
								<div className="grid gap-2">
									<Label htmlFor="agent-escalate">Escalate to a human on</Label>
									<Input
										id="agent-escalate"
										value={guardrails.escalateOn.join(", ")}
										placeholder="angry, legal threat"
										onChange={(e) =>
											setGuardrails((g) => ({
												...g,
												escalateOn: parseList(e.target.value).slice(0, 10),
											}))
										}
									/>
								</div>
								<div className="grid gap-2">
									<Label htmlFor="agent-words">Max words per turn</Label>
									<Input
										id="agent-words"
										type="number"
										min={10}
										max={120}
										value={guardrails.maxWordsPerTurn}
										onChange={(e) =>
											setGuardrails((g) => ({
												...g,
												maxWordsPerTurn: Number(e.target.value) || 45,
											}))
										}
									/>
								</div>
							</div>
						</div>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
							disabled={pending}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={pending}>
							{pending ? "Saving..." : isEdit ? "Save changes" : "Create agent"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
