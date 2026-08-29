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
	ScrollIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { orpc } from "@/utils/orpc";

const PAGE_SIZE = 50;

const ACTOR_TYPES = [
	{ value: "ALL", label: "Any actor" },
	{ value: "USER", label: "A person" },
	{ value: "SYSTEM", label: "The system" },
	{ value: "AI", label: "The AI" },
	{ value: "PROVIDER", label: "A provider" },
] as const;

/** Prefix filters — the action column is a dotted verb, so a prefix is a family. */
const ACTION_GROUPS = [
	{ value: "ALL", label: "Everything" },
	{ value: "call", label: "Calls" },
	{ value: "lead", label: "Leads" },
	{ value: "suppression", label: "Suppressions" },
	{ value: "followup", label: "Follow-ups" },
	{ value: "agent", label: "Agents" },
	{ value: "settings", label: "Settings" },
] as const;

const ACTOR_TONE: Record<
	string,
	"default" | "secondary" | "destructive" | "outline"
> = {
	USER: "outline",
	SYSTEM: "secondary",
	AI: "default",
	PROVIDER: "secondary",
};

/**
 * Which resources have a page worth linking to.
 *
 * Returns the literal template rather than a plain string so typed routes
 * accept it without a cast.
 */
function resourceHref(type: string, id: string | null) {
	if (!id) return null;
	if (type === "lead") return `/leads/${id}` as const;
	if (type === "call") return `/calls/${id}` as const;
	return null;
}

function formatWhen(value: string | Date): string {
	return new Date(value).toLocaleString(undefined, {
		day: "2-digit",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

/** Renders metadata compactly — the full object is rarely what you want to read. */
function MetadataSummary({ value }: { value: Record<string, unknown> }) {
	const entries = Object.entries(value ?? {}).slice(0, 4);
	if (entries.length === 0)
		return <span className="text-muted-foreground">—</span>;

	return (
		<div className="flex flex-wrap gap-x-3 gap-y-0.5">
			{entries.map(([key, raw]) => (
				<span key={key} className="text-xs">
					<span className="text-muted-foreground">{key}: </span>
					<span className="font-mono">
						{typeof raw === "object" ? JSON.stringify(raw) : String(raw)}
					</span>
				</span>
			))}
		</div>
	);
}

/**
 * The audit trail.
 *
 * Every autonomous action lands here, which is what makes "why did it call
 * this person?" an answerable question rather than a guess about a prompt.
 */
export function AuditLog() {
	const [actorType, setActorType] = useState<string>("ALL");
	const [group, setGroup] = useState<string>("ALL");
	const [resourceId, setResourceId] = useState("");
	const [page, setPage] = useState(0);

	const list = useQuery(
		orpc.compliance.listAudit.queryOptions({
			input: {
				limit: PAGE_SIZE,
				offset: page * PAGE_SIZE,
				...(actorType === "ALL" ? {} : { actorType: actorType as "USER" }),
				...(group === "ALL" ? {} : { action: group }),
				...(resourceId.trim() ? { resourceId: resourceId.trim() } : {}),
			},
		}),
	);

	const total = list.data?.total ?? 0;
	const events = list.data?.events ?? [];
	const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-end gap-3">
				<div className="flex flex-col gap-1">
					<span className="font-medium text-sm">Actor</span>
					<Select
						value={actorType}
						onValueChange={(v) => {
							setActorType(v ?? "ALL");
							setPage(0);
						}}
					>
						<SelectTrigger className="w-[160px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{ACTOR_TYPES.map((a) => (
								<SelectItem key={a.value} value={a.value}>
									{a.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="flex flex-col gap-1">
					<span className="font-medium text-sm">Area</span>
					<Select
						value={group}
						onValueChange={(v) => {
							setGroup(v ?? "ALL");
							setPage(0);
						}}
					>
						<SelectTrigger className="w-[160px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{ACTION_GROUPS.map((a) => (
								<SelectItem key={a.value} value={a.value}>
									{a.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="flex flex-col gap-1">
					<span className="font-medium text-sm">Resource id</span>
					<Input
						value={resourceId}
						onChange={(e) => {
							setResourceId(e.target.value);
							setPage(0);
						}}
						placeholder="Paste a lead or call id"
						className="w-[280px] font-mono text-xs"
					/>
				</div>
			</div>

			<Card>
				<CardContent className="p-0">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>When</TableHead>
								<TableHead>Who</TableHead>
								<TableHead>Did what</TableHead>
								<TableHead>To</TableHead>
								<TableHead>Details</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{list.isPending ? (
								[0, 1, 2].map((i) => (
									<TableRow key={i}>
										{[0, 1, 2, 3, 4].map((c) => (
											<TableCell key={c}>
												<Skeleton className="h-5 w-full" />
											</TableCell>
										))}
									</TableRow>
								))
							) : events.length > 0 ? (
								events.map((event) => {
									const href = resourceHref(
										event.resourceType,
										event.resourceId,
									);
									return (
										<TableRow key={event.id}>
											<TableCell className="whitespace-nowrap text-muted-foreground text-sm">
												{formatWhen(event.createdAt)}
											</TableCell>
											<TableCell>
												<div className="flex flex-col gap-1">
													<Badge
														variant={ACTOR_TONE[event.actorType] ?? "secondary"}
													>
														{event.actorType.toLowerCase()}
													</Badge>
													{event.actorName ? (
														<span className="text-muted-foreground text-xs">
															{event.actorName}
														</span>
													) : null}
												</div>
											</TableCell>
											<TableCell>
												<span className="font-mono text-sm">
													{event.action}
												</span>
												{event.reason ? (
													<p className="max-w-xs text-muted-foreground text-xs">
														{event.reason}
													</p>
												) : null}
											</TableCell>
											<TableCell>
												{href ? (
													<Link href={href} className="text-sm hover:underline">
														{event.resourceType}
													</Link>
												) : (
													<span className="text-muted-foreground text-sm">
														{event.resourceType}
													</span>
												)}
											</TableCell>
											<TableCell className="max-w-sm">
												<MetadataSummary
													value={
														event.metadata as unknown as Record<string, unknown>
													}
												/>
											</TableCell>
										</TableRow>
									);
								})
							) : (
								<TableRow>
									<TableCell colSpan={5}>
										<div className="flex flex-col items-center gap-2 py-10 text-center">
											<ScrollIcon className="size-8 text-muted-foreground" />
											<p className="font-medium">No events match</p>
											<p className="max-w-sm text-muted-foreground text-sm">
												Every dispatch, refusal, opt-out and settings change is
												recorded here as it happens.
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
						Showing {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + events.length} of{" "}
						{total}
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
