"use client";

import { Badge } from "@doki/ui/components/badge";
import { Button } from "@doki/ui/components/button";
import { Card, CardContent } from "@doki/ui/components/card";
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
	MagnifyingGlassIcon,
	SealCheckIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";

import { orpc } from "@/utils/orpc";

const PAGE_SIZE = 50;

const STATUSES = [
	{ value: "ALL", label: "All statuses" },
	{ value: "GRANTED", label: "Granted" },
	{ value: "REVOKED", label: "Revoked" },
	{ value: "EXPIRED", label: "Expired" },
	{ value: "UNKNOWN", label: "Unknown" },
] as const;

const TONE: Record<
	string,
	"default" | "secondary" | "destructive" | "outline"
> = {
	GRANTED: "outline",
	REVOKED: "destructive",
	EXPIRED: "secondary",
	UNKNOWN: "secondary",
};

function formatWhen(value: string | Date): string {
	return new Date(value).toLocaleString(undefined, {
		day: "2-digit",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

/**
 * The workspace-wide consent trail.
 *
 * Append-only by design: a row is never edited, so this reads as a history of
 * how permission to call each number was obtained — which is the form the
 * question gets asked in when a complaint arrives.
 */
export function ConsentRegistry() {
	const [searchInput, setSearchInput] = useState("");
	const [search, setSearch] = useState("");
	const [status, setStatus] = useState<string>("ALL");
	const [page, setPage] = useState(0);

	useEffect(() => {
		const id = setTimeout(() => {
			setSearch(searchInput.trim());
			setPage(0);
		}, 300);
		return () => clearTimeout(id);
	}, [searchInput]);

	const list = useQuery(
		orpc.compliance.listConsents.queryOptions({
			input: {
				limit: PAGE_SIZE,
				offset: page * PAGE_SIZE,
				...(search ? { search } : {}),
				...(status === "ALL" ? {} : { status: status as "GRANTED" }),
			},
		}),
	);

	const total = list.data?.total ?? 0;
	const records = list.data?.records ?? [];
	const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

	return (
		<div className="flex flex-col gap-4">
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
					<span className="font-medium text-sm">Status</span>
					<Select
						value={status}
						onValueChange={(v) => {
							setStatus(v ?? "ALL");
							setPage(0);
						}}
					>
						<SelectTrigger className="w-[170px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{STATUSES.map((s) => (
								<SelectItem key={s.value} value={s.value}>
									{s.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			<Card>
				<CardContent className="p-0">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Number</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>How it was obtained</TableHead>
								<TableHead>Evidence</TableHead>
								<TableHead>Attested by</TableHead>
								<TableHead>When</TableHead>
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
							) : records.length > 0 ? (
								records.map((record) => (
									<TableRow key={record.id}>
										<TableCell>
											{record.leadId ? (
												<Link
													href={`/leads/${record.leadId}`}
													className="flex flex-col hover:underline"
												>
													<span className="font-mono text-sm">
														{record.phoneE164}
													</span>
													{record.leadName ? (
														<span className="text-muted-foreground text-xs">
															{record.leadName}
														</span>
													) : null}
												</Link>
											) : (
												<span className="font-mono text-sm">
													{record.phoneE164}
												</span>
											)}
										</TableCell>
										<TableCell>
											<Badge variant={TONE[record.status] ?? "secondary"}>
												{record.status.toLowerCase()}
											</Badge>
										</TableCell>
										<TableCell className="text-sm">
											{record.source.replaceAll("_", " ").toLowerCase()}
										</TableCell>
										<TableCell className="max-w-xs text-sm">
											{record.evidence ?? (
												<span className="text-muted-foreground">
													none recorded
												</span>
											)}
										</TableCell>
										<TableCell className="text-sm">
											{record.attestedByName ?? "—"}
										</TableCell>
										<TableCell className="text-muted-foreground text-sm">
											{formatWhen(record.occurredAt)}
										</TableCell>
									</TableRow>
								))
							) : (
								<TableRow>
									<TableCell colSpan={6}>
										<div className="flex flex-col items-center gap-2 py-10 text-center">
											<SealCheckIcon className="size-8 text-muted-foreground" />
											<p className="font-medium">No consent recorded yet</p>
											<p className="max-w-sm text-muted-foreground text-sm">
												Records appear when consent is attested on import, set
												on a lead, or revoked during a call. Promotional calls
												are refused without one.
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
						Showing {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + records.length}{" "}
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
		</div>
	);
}
