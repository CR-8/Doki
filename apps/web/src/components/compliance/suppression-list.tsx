"use client";

import { Badge } from "@doki/ui/components/badge";
import { Button } from "@doki/ui/components/button";
import { Card, CardContent } from "@doki/ui/components/card";
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
	DownloadSimpleIcon,
	LockKeyIcon,
	MagnifyingGlassIcon,
	PlusIcon,
	ProhibitIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

const PAGE_SIZE = 50;

const REASONS = [
	{ value: "MANUAL", label: "Manual block" },
	{ value: "USER_OPT_OUT", label: "Opted out" },
	{ value: "DND_REGISTRY", label: "On DND registry" },
	{ value: "WRONG_NUMBER", label: "Wrong number" },
	{ value: "COMPLAINT", label: "Complaint" },
	{ value: "BOUNCED", label: "Bounced" },
] as const;

const REASON_LABEL: Record<string, string> = Object.fromEntries(
	REASONS.map((r) => [r.value, r.label]),
);

const FREEZE_OPTIONS = [
	{ value: "permanent", label: "Permanently" },
	{ value: "90", label: "For 90 days" },
	{ value: "180", label: "For 180 days" },
	{ value: "365", label: "For a year" },
];

type Entry = {
	id: string;
	phoneE164: string;
	reason: string;
	notes: string | null;
	suppressedUntil: string | Date | null;
	createdAt: string | Date;
	createdByName: string | null;
	leadId: string | null;
	leadName: string | null;
};

function formatDate(value: string | Date | null): string {
	if (!value) return "—";
	return new Date(value).toLocaleDateString(undefined, {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

/** True while the entry still blocks dialling. */
function isActive(entry: Entry): boolean {
	if (!entry.suppressedUntil) return true;
	return new Date(entry.suppressedUntil) > new Date();
}

function AddSuppressionDialog() {
	const [open, setOpen] = useState(false);
	const [reason, setReason] = useState<string>("MANUAL");
	const [freeze, setFreeze] = useState("permanent");
	const queryClient = useQueryClient();

	const add = useMutation(
		orpc.compliance.addSuppression.mutationOptions({
			onSuccess: () => {
				toast.success("Number blocked", {
					description: "No call can reach it while the block stands.",
				});
				setOpen(false);
				queryClient.invalidateQueries({
					queryKey: orpc.compliance.listSuppressions.key(),
				});
				queryClient.invalidateQueries({
					queryKey: orpc.compliance.overview.key(),
				});
				queryClient.invalidateQueries({ queryKey: orpc.leads.list.key() });
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		add.mutate({
			phone: String(form.get("phone") ?? "").trim(),
			reason: reason as "MANUAL",
			notes: (form.get("notes") as string)?.trim() || undefined,
			freezeDays: freeze === "permanent" ? null : Number(freeze),
		});
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger render={<Button size="sm" />}>
				<PlusIcon className="size-4" />
				Block a number
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>Block a number</DialogTitle>
						<DialogDescription>
							Checked before every dial, with no exceptions. Any lead holding
							this number is suppressed too.
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-4 py-4">
						<div className="grid gap-2">
							<Label htmlFor="sup-phone">Phone number</Label>
							<Input
								id="sup-phone"
								name="phone"
								required
								placeholder="+91 98765 43210"
							/>
						</div>

						<div className="grid grid-cols-2 gap-3">
							<div className="grid gap-2">
								<Label>Reason</Label>
								<Select
									value={reason}
									onValueChange={(v) => setReason(v ?? "MANUAL")}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{REASONS.map((r) => (
											<SelectItem key={r.value} value={r.value}>
												{r.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="grid gap-2">
								<Label>Duration</Label>
								<Select
									value={freeze}
									onValueChange={(v) => setFreeze(v ?? "permanent")}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{FREEZE_OPTIONS.map((f) => (
											<SelectItem key={f.value} value={f.value}>
												{f.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>

						<div className="grid gap-2">
							<Label htmlFor="sup-notes">Note</Label>
							<Input
								id="sup-notes"
								name="notes"
								maxLength={300}
								placeholder="Asked to be removed by email on 14 Aug"
							/>
							<p className="text-muted-foreground text-xs">
								Recording an opt-out here starts a freeze that cannot be lifted
								early. Choose the reason accordingly.
							</p>
						</div>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setOpen(false)}
							disabled={add.isPending}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={add.isPending}>
							{add.isPending ? "Blocking..." : "Block"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function LiftDialog({
	entry,
	open,
	onOpenChange,
}: {
	entry: Entry | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const queryClient = useQueryClient();

	const lift = useMutation(
		orpc.compliance.liftSuppression.mutationOptions({
			onSuccess: () => {
				toast.success("Suppression lifted", {
					description: "Recorded in the audit log with your reason.",
				});
				onOpenChange(false);
				queryClient.invalidateQueries({
					queryKey: orpc.compliance.listSuppressions.key(),
				});
				queryClient.invalidateQueries({
					queryKey: orpc.compliance.overview.key(),
				});
				queryClient.invalidateQueries({ queryKey: orpc.leads.list.key() });
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!entry) return null;
	const isOptOut = entry.reason === "USER_OPT_OUT";

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!entry) return;
		const form = new FormData(event.currentTarget);
		lift.mutate({
			id: entry.id,
			reason: String(form.get("reason") ?? "").trim(),
		});
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>Lift this block?</DialogTitle>
						<DialogDescription className="font-mono">
							{entry.phoneE164}
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-4 py-4">
						{isOptOut ? (
							<div className="flex items-start gap-3 rounded-md border border-destructive/40 p-3">
								<LockKeyIcon className="mt-0.5 size-5 text-destructive" />
								<div className="flex flex-col gap-1">
									<p className="font-medium text-sm">This person opted out</p>
									<p className="text-muted-foreground text-sm">
										The freeze runs to {formatDate(entry.suppressedUntil)} and
										the server will refuse to lift it early. The number becomes
										callable again by obtaining fresh consent — not by deleting
										the record.
									</p>
								</div>
							</div>
						) : null}

						<div className="grid gap-2">
							<Label htmlFor="lift-reason">Why are you lifting it?</Label>
							<Input
								id="lift-reason"
								name="reason"
								required
								minLength={3}
								maxLength={300}
								placeholder="Blocked in error — wrong number entered"
							/>
							<p className="text-muted-foreground text-xs">
								Stored against the audit event. This is the answer to "who
								un-blocked this number, and why".
							</p>
						</div>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
							disabled={lift.isPending}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							variant="destructive"
							disabled={lift.isPending}
						>
							{lift.isPending ? "Lifting..." : "Lift block"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export function SuppressionList() {
	const [searchInput, setSearchInput] = useState("");
	const [search, setSearch] = useState("");
	const [reason, setReason] = useState<string>("ALL");
	const [page, setPage] = useState(0);
	const [lifting, setLifting] = useState<Entry | null>(null);

	useEffect(() => {
		const id = setTimeout(() => {
			setSearch(searchInput.trim());
			setPage(0);
		}, 300);
		return () => clearTimeout(id);
	}, [searchInput]);

	const list = useQuery(
		orpc.compliance.listSuppressions.queryOptions({
			input: {
				limit: PAGE_SIZE,
				offset: page * PAGE_SIZE,
				...(search ? { search } : {}),
				...(reason === "ALL" ? {} : { reason: reason as "MANUAL" }),
			},
		}),
	);

	const exportList = useMutation(
		orpc.compliance.exportSuppressions.mutationOptions({
			onSuccess: (result) => {
				const header = "phone,reason,notes,suppressed_until,created_at";
				const body = result.rows
					.map((row) =>
						[
							row.phoneE164,
							row.reason,
							// Quote the free-text column: a comma in a note would
							// otherwise shift every following field by one.
							`"${(row.notes ?? "").replaceAll('"', '""')}"`,
							row.suppressedUntil
								? new Date(row.suppressedUntil).toISOString()
								: "permanent",
							new Date(row.createdAt).toISOString(),
						].join(","),
					)
					.join("\n");

				const blob = new Blob([`${header}\n${body}\n`], {
					type: "text/csv;charset=utf-8",
				});
				const url = URL.createObjectURL(blob);
				const link = document.createElement("a");
				link.href = url;
				link.download = `suppression-list-${new Date(result.generatedAt).toISOString().slice(0, 10)}.csv`;
				link.click();
				URL.revokeObjectURL(url);

				toast.success(`Exported ${result.rows.length} numbers`);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const total = list.data?.total ?? 0;
	const entries = (list.data?.entries ?? []) as Entry[];
	const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

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
								placeholder="Phone number"
								className="w-[220px] pl-8"
							/>
						</div>
					</div>
					<div className="flex flex-col gap-1">
						<span className="font-medium text-sm">Reason</span>
						<Select
							value={reason}
							onValueChange={(v) => {
								setReason(v ?? "ALL");
								setPage(0);
							}}
						>
							<SelectTrigger className="w-[180px]">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="ALL">All reasons</SelectItem>
								{REASONS.map((r) => (
									<SelectItem key={r.value} value={r.value}>
										{r.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>

				<div className="flex items-center gap-2">
					<Button
						size="sm"
						variant="outline"
						disabled={exportList.isPending}
						onClick={() => exportList.mutate({})}
					>
						<DownloadSimpleIcon className="size-4" />
						{exportList.isPending ? "Exporting..." : "Export CSV"}
					</Button>
					<AddSuppressionDialog />
				</div>
			</div>

			<Card>
				<CardContent className="p-0">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Number</TableHead>
								<TableHead>Reason</TableHead>
								<TableHead>In force</TableHead>
								<TableHead>Note</TableHead>
								<TableHead>Added</TableHead>
								<TableHead className="text-right" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{list.isPending ? (
								[0, 1, 2].map((i) => (
									<TableRow key={i}>
										{[0, 1, 2, 3, 4, 5].map((c) => (
											<TableCell key={c}>
												<Skeleton className="h-5 w-full" />
											</TableCell>
										))}
									</TableRow>
								))
							) : entries.length > 0 ? (
								entries.map((entry) => {
									const active = isActive(entry);
									return (
										<TableRow key={entry.id}>
											<TableCell>
												{entry.leadId ? (
													<Link
														href={`/leads/${entry.leadId}`}
														className="flex flex-col hover:underline"
													>
														<span className="font-mono text-sm">
															{entry.phoneE164}
														</span>
														<span className="text-muted-foreground text-xs">
															{entry.leadName ?? "Linked lead"}
														</span>
													</Link>
												) : (
													<span className="font-mono text-sm">
														{entry.phoneE164}
													</span>
												)}
											</TableCell>
											<TableCell>
												<Badge
													variant={
														entry.reason === "USER_OPT_OUT"
															? "destructive"
															: "secondary"
													}
												>
													{REASON_LABEL[entry.reason] ?? entry.reason}
												</Badge>
											</TableCell>
											<TableCell>
												{active ? (
													<span className="text-sm">
														{entry.suppressedUntil
															? `until ${formatDate(entry.suppressedUntil)}`
															: "permanent"}
													</span>
												) : (
													<span className="text-muted-foreground text-sm">
														expired {formatDate(entry.suppressedUntil)}
													</span>
												)}
											</TableCell>
											<TableCell className="max-w-xs text-sm">
												{entry.notes ?? "—"}
											</TableCell>
											<TableCell className="text-muted-foreground text-sm">
												{formatDate(entry.createdAt)}
												{entry.createdByName ? (
													<span className="block text-xs">
														{entry.createdByName}
													</span>
												) : null}
											</TableCell>
											<TableCell className="text-right">
												<Button
													size="sm"
													variant="ghost"
													onClick={() => setLifting(entry)}
												>
													Lift
												</Button>
											</TableCell>
										</TableRow>
									);
								})
							) : (
								<TableRow>
									<TableCell colSpan={6}>
										<div className="flex flex-col items-center gap-2 py-10 text-center">
											<ProhibitIcon className="size-8 text-muted-foreground" />
											<p className="font-medium">Nothing blocked</p>
											<p className="max-w-sm text-muted-foreground text-sm">
												Opt-outs heard on a call land here automatically, before
												the call record is even finalised.
											</p>
										</div>
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			{lastPage > 0 ? (
				<div className="flex items-center justify-between gap-3">
					<p className="text-muted-foreground text-xs">
						Showing {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + entries.length}{" "}
						of {total}
					</p>
					<div className="flex items-center gap-2">
						<Button
							size="sm"
							variant="outline"
							disabled={page === 0 || list.isFetching}
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
							disabled={page >= lastPage || list.isFetching}
							onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
						>
							Next
							<CaretRightIcon className="size-4" />
						</Button>
					</div>
				</div>
			) : null}

			<LiftDialog
				entry={lifting}
				open={lifting !== null}
				onOpenChange={(next) => {
					if (!next) setLifting(null);
				}}
			/>
		</div>
	);
}
