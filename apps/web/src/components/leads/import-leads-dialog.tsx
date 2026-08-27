"use client";

import { Badge } from "@doki/ui/components/badge";
import { Button } from "@doki/ui/components/button";
import { Checkbox } from "@doki/ui/components/checkbox";
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
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@doki/ui/components/table";
import { UploadSimpleIcon, WarningIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

const CONSENT_SOURCES = [
	{ value: "WEB_FORM", label: "Website form submission" },
	{ value: "INBOUND_ENQUIRY", label: "Inbound enquiry" },
	{ value: "EXISTING_CUSTOMER", label: "Existing customer relationship" },
	{ value: "IMPORT_ATTESTED", label: "Other — attested on import" },
] as const;

/** Guards against a mis-picked file locking the browser. */
const MAX_BYTES = 5_000_000;

export function ImportLeadsDialog() {
	const [open, setOpen] = useState(false);
	const [csv, setCsv] = useState("");
	const [fileName, setFileName] = useState("");
	const [attested, setAttested] = useState(false);
	const [consentSource, setConsentSource] = useState<string>("WEB_FORM");
	const [evidence, setEvidence] = useState("");
	const fileRef = useRef<HTMLInputElement>(null);
	const queryClient = useQueryClient();

	const preview = useMutation(
		orpc.leads.previewImport.mutationOptions({
			onError: (error) => toast.error(error.message),
		}),
	);

	const commit = useMutation(
		orpc.leads.commitImport.mutationOptions({
			onSuccess: (result) => {
				toast.success(`Imported ${result.created} leads`, {
					description: [
						result.alreadyExisted
							? `${result.alreadyExisted} already existed`
							: null,
						result.rejected ? `${result.rejected} rejected` : null,
						result.duplicatesInFile
							? `${result.duplicatesInFile} duplicates in file`
							: null,
					]
						.filter(Boolean)
						.join(" · "),
				});
				reset();
				setOpen(false);
				queryClient.invalidateQueries({ queryKey: orpc.leads.list.key() });
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	function reset() {
		setCsv("");
		setFileName("");
		setAttested(false);
		setEvidence("");
		preview.reset();
		if (fileRef.current) fileRef.current.value = "";
	}

	async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		if (!file) return;

		if (file.size > MAX_BYTES) {
			toast.error("File is too large", {
				description: "Maximum size is 5 MB.",
			});
			return;
		}

		const text = await file.text();
		setCsv(text);
		setFileName(file.name);
		preview.mutate({ csv: text });
	}

	const data = preview.data;
	const problems = (data?.rejectedCount ?? 0) + (data?.duplicateCount ?? 0);
	const canCommit = Boolean(data && data.validCount > 0 && !commit.isPending);

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) reset();
			}}
		>
			<DialogTrigger render={<Button size="sm" variant="outline" />}>
				<UploadSimpleIcon className="size-4" />
				Import CSV
			</DialogTrigger>

			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Import leads</DialogTitle>
					<DialogDescription>
						Columns are detected automatically. Phone numbers are normalised to
						E.164 so duplicates and opt-outs match reliably.
					</DialogDescription>
				</DialogHeader>

				<div className="grid max-h-[60vh] gap-4 overflow-y-auto py-2">
					<div className="grid gap-2">
						<Label htmlFor="csv-file">CSV file</Label>
						<Input
							id="csv-file"
							ref={fileRef}
							type="file"
							accept=".csv,text/csv"
							onChange={handleFile}
						/>
						{fileName ? (
							<p className="text-muted-foreground text-xs">{fileName}</p>
						) : null}
					</div>

					{preview.isPending ? (
						<p className="text-muted-foreground text-sm">Reading file…</p>
					) : null}

					{data ? (
						<>
							<div className="flex flex-wrap gap-2">
								<Badge variant="outline">{data.totalRows} rows</Badge>
								<Badge variant="default">{data.validCount} importable</Badge>
								{data.rejectedCount > 0 ? (
									<Badge variant="destructive">
										{data.rejectedCount} rejected
									</Badge>
								) : null}
								{data.duplicateCount > 0 ? (
									<Badge variant="secondary">
										{data.duplicateCount} duplicates in file
									</Badge>
								) : null}
							</div>

							{data.validCount > 0 ? (
								<div className="rounded-md border border-border">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>Name</TableHead>
												<TableHead>Phone</TableHead>
												<TableHead>Company</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{data.sample.map((lead) => (
												<TableRow key={`${lead.row}-${lead.phoneE164}`}>
													<TableCell>{lead.name ?? "—"}</TableCell>
													<TableCell className="font-mono text-sm">
														{lead.phoneE164}
													</TableCell>
													<TableCell>{lead.company ?? "—"}</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
									{data.validCount > data.sample.length ? (
										<p className="border-border border-t p-2 text-muted-foreground text-xs">
											…and {data.validCount - data.sample.length} more
										</p>
									) : null}
								</div>
							) : null}

							{problems > 0 ? (
								<div className="flex flex-col gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
									<div className="flex items-center gap-2">
										<WarningIcon className="size-4 text-amber-600 dark:text-amber-500" />
										<span className="font-medium text-sm">
											{problems} row{problems === 1 ? "" : "s"} will be skipped
										</span>
									</div>
									<div className="flex max-h-32 flex-col gap-1 overflow-y-auto">
										{[...data.rejected, ...data.duplicatesInFile]
											.slice(0, 20)
											.map((r) => (
												<p
													key={`${r.row}-${r.reason}`}
													className="font-mono text-muted-foreground text-xs"
												>
													Row {r.row}: {r.reason}
													{r.value ? ` (${r.value})` : ""}
												</p>
											))}
									</div>
								</div>
							) : null}

							<div className="flex flex-col gap-3 rounded-md border border-border bg-muted/40 p-3">
								<div className="flex items-start gap-2">
									<Checkbox
										id="attest"
										checked={attested}
										onCheckedChange={(v) => setAttested(Boolean(v))}
									/>
									<Label htmlFor="attest" className="text-sm leading-relaxed">
										I confirm these contacts have consented to being called, and
										that this consent can be evidenced on request.
									</Label>
								</div>

								{attested ? (
									<div className="grid gap-3 pl-6">
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
													{CONSENT_SOURCES.map((s) => (
														<SelectItem key={s.value} value={s.value}>
															{s.label}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
										<div className="grid gap-2">
											<Label htmlFor="evidence">Evidence reference</Label>
											<Input
												id="evidence"
												value={evidence}
												onChange={(e) => setEvidence(e.target.value)}
												placeholder="Form URL, CRM export ID, ticket reference"
											/>
										</div>
									</div>
								) : (
									<p className="pl-6 text-muted-foreground text-xs">
										Without consent these leads can still receive service calls,
										but promotional calls will be refused.
									</p>
								)}
							</div>
						</>
					) : null}
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => setOpen(false)}
						disabled={commit.isPending}
					>
						Cancel
					</Button>
					<Button
						type="button"
						disabled={!canCommit}
						onClick={() =>
							commit.mutate({
								csv,
								consentAttested: attested,
								...(attested
									? {
											consentSource: consentSource as "WEB_FORM",
											consentEvidence: evidence || undefined,
										}
									: {}),
							})
						}
					>
						{commit.isPending
							? "Importing…"
							: data
								? `Import ${data.validCount} leads`
								: "Import"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
