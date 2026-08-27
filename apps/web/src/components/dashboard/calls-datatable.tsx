"use client";

import { Button } from "@doki/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@doki/ui/components/dropdown-menu";
import {
	Pagination,
	PaginationContent,
	PaginationEllipsis,
	PaginationItem,
} from "@doki/ui/components/pagination";
import { Skeleton } from "@doki/ui/components/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@doki/ui/components/table";
import { usePagination } from "@doki/ui/hooks/use-pagination";
import {
	CaretLeftIcon,
	CaretRightIcon,
	DotsThreeVerticalIcon,
	PhoneCallIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { orpc } from "@/utils/orpc";

import {
	CallStatusBadge,
	formatDuration,
	formatInr,
	OutcomeBadge,
} from "../calls/call-status-badge";

const PAGE_SIZE = 5;

function RowActions({
	callId,
	leadId,
}: {
	callId: string;
	leadId: string | null;
}) {
	const router = useRouter();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button size="icon" variant="ghost" aria-label="Call actions" />
				}
			>
				<DotsThreeVerticalIcon className="size-5" aria-hidden="true" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuGroup>
					<DropdownMenuItem onClick={() => router.push(`/calls/${callId}`)}>
						<span>Open call</span>
					</DropdownMenuItem>
					<DropdownMenuItem
						disabled={!leadId}
						onClick={() => router.push("/leads")}
					>
						<span>View lead</span>
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/**
 * Recent calls, served straight from the calls API.
 *
 * Pagination is server-side — the table asks for one page at a time rather
 * than pulling every call into the browser to slice locally, which matters
 * once a workspace has run more than a demo's worth of calls.
 */
export function CallsDatatable() {
	const [pageIndex, setPageIndex] = useState(0);

	const calls = useQuery(
		orpc.calls.list.queryOptions({
			input: { limit: PAGE_SIZE, offset: pageIndex * PAGE_SIZE },
		}),
	);

	const total = calls.data?.total ?? 0;
	const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

	const { pages, showLeftEllipsis, showRightEllipsis } = usePagination({
		currentPage: pageIndex + 1,
		totalPages,
		paginationItemsToDisplay: 3,
	});

	const rows = calls.data?.calls ?? [];
	const from = total === 0 ? 0 : pageIndex * PAGE_SIZE + 1;
	const to = Math.min((pageIndex + 1) * PAGE_SIZE, total);

	return (
		<div className="w-full">
			<div className="border-b">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="h-14 text-muted-foreground first:pl-6">
								Lead
							</TableHead>
							<TableHead className="text-muted-foreground">Status</TableHead>
							<TableHead className="text-muted-foreground">Outcome</TableHead>
							<TableHead className="text-right text-muted-foreground">
								Duration
							</TableHead>
							<TableHead className="text-right text-muted-foreground">
								Cost
							</TableHead>
							<TableHead className="text-muted-foreground">When</TableHead>
							<TableHead className="w-15 text-muted-foreground">
								Actions
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{calls.isPending ? (
							Array.from({ length: PAGE_SIZE }, (_, i) => (
								<TableRow key={i}>
									{Array.from({ length: 7 }, (_, c) => (
										<TableCell key={c} className="first:pl-6">
											<Skeleton className="h-5 w-full" />
										</TableCell>
									))}
								</TableRow>
							))
						) : rows.length > 0 ? (
							rows.map((call) => (
								<TableRow key={call.id}>
									<TableCell className="first:pl-6">
										<Link href={`/calls/${call.id}`} className="flex flex-col">
											<span className="font-medium text-card-foreground text-sm">
												{call.leadName ?? call.toNumber}
											</span>
											<span className="font-mono text-muted-foreground text-xs">
												{call.toNumber}
												{call.attempt > 1 ? ` · attempt ${call.attempt}` : ""}
											</span>
										</Link>
									</TableCell>
									<TableCell>
										<CallStatusBadge status={call.status} />
									</TableCell>
									<TableCell>
										<OutcomeBadge outcome={call.outcome} />
									</TableCell>
									<TableCell className="text-right font-mono text-sm">
										{formatDuration(call.billableSeconds)}
									</TableCell>
									<TableCell className="text-right font-mono text-sm">
										{formatInr(call.totalCostInr)}
									</TableCell>
									<TableCell className="text-muted-foreground text-sm">
										{new Date(call.createdAt).toLocaleString(undefined, {
											day: "2-digit",
											month: "short",
											hour: "2-digit",
											minute: "2-digit",
										})}
									</TableCell>
									<TableCell>
										<RowActions
											callId={call.id}
											leadId={call.leadName ? "y" : null}
										/>
									</TableCell>
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell colSpan={7}>
									<div className="flex flex-col items-center gap-2 py-12 text-center">
										<PhoneCallIcon className="size-8 text-muted-foreground" />
										<p className="font-medium">No calls yet</p>
										<p className="max-w-sm text-muted-foreground text-sm">
											Place a call from the Leads page and it will appear here.
										</p>
									</div>
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>

			<div className="flex items-center justify-between gap-3 px-6 py-4 max-sm:flex-col md:max-lg:flex-col">
				<p
					className="whitespace-nowrap text-muted-foreground text-sm"
					aria-live="polite"
				>
					Showing{" "}
					<span>
						{from} to {to}
					</span>{" "}
					of <span>{total} calls</span>
				</p>

				<Pagination>
					<PaginationContent>
						<PaginationItem>
							<Button
								variant="ghost"
								className="disabled:pointer-events-none disabled:opacity-50"
								onClick={() => setPageIndex((i) => Math.max(i - 1, 0))}
								disabled={pageIndex === 0}
								aria-label="Go to previous page"
							>
								<CaretLeftIcon aria-hidden="true" />
								Previous
							</Button>
						</PaginationItem>

						{showLeftEllipsis ? (
							<PaginationItem>
								<PaginationEllipsis />
							</PaginationItem>
						) : null}

						{pages.map((page) => {
							const isActive = page === pageIndex + 1;
							return (
								<PaginationItem key={page}>
									<Button
										size="icon"
										variant={isActive ? "default" : "ghost"}
										onClick={() => setPageIndex(page - 1)}
										aria-current={isActive ? "page" : undefined}
									>
										{page}
									</Button>
								</PaginationItem>
							);
						})}

						{showRightEllipsis ? (
							<PaginationItem>
								<PaginationEllipsis />
							</PaginationItem>
						) : null}

						<PaginationItem>
							<Button
								variant="ghost"
								className="disabled:pointer-events-none disabled:opacity-50"
								onClick={() =>
									setPageIndex((i) => Math.min(i + 1, totalPages - 1))
								}
								disabled={pageIndex >= totalPages - 1}
								aria-label="Go to next page"
							>
								Next
								<CaretRightIcon aria-hidden="true" />
							</Button>
						</PaginationItem>
					</PaginationContent>
				</Pagination>
			</div>
		</div>
	);
}
