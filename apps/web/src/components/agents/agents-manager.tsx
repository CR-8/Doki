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
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@doki/ui/components/dropdown-menu";
import { Skeleton } from "@doki/ui/components/skeleton";
import {
	ArchiveIcon,
	CheckCircleIcon,
	DotsThreeIcon,
	PauseIcon,
	PencilSimpleIcon,
	PlusIcon,
	RobotIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

import { AgentEditorDialog, type EditableAgent } from "./agent-editor-dialog";

const STATUS_TONE: Record<
	string,
	"default" | "secondary" | "destructive" | "outline"
> = {
	ACTIVE: "default",
	DRAFT: "secondary",
	PAUSED: "outline",
	ARCHIVED: "secondary",
};

export function AgentsManager() {
	const [editing, setEditing] = useState<EditableAgent | null>(null);
	const [open, setOpen] = useState(false);
	const [showArchived, setShowArchived] = useState(false);
	const queryClient = useQueryClient();

	const agents = useQuery(orpc.agents.list.queryOptions());

	const setStatus = useMutation(
		orpc.agents.update.mutationOptions({
			onSuccess: () => {
				toast.success("Agent updated");
				queryClient.invalidateQueries({ queryKey: orpc.agents.list.key() });
				queryClient.invalidateQueries({
					queryKey: orpc.dashboard.overview.key(),
				});
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const all = agents.data ?? [];
	const visible = showArchived
		? all
		: all.filter((agent) => agent.status !== "ARCHIVED");
	const archivedCount = all.length - visible.length;

	function openEditor(agent: EditableAgent | null) {
		setEditing(agent);
		setOpen(true);
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-3">
				{archivedCount > 0 ? (
					<Button
						size="sm"
						variant="ghost"
						onClick={() => setShowArchived((v) => !v)}
					>
						{showArchived ? "Hide archived" : `Show ${archivedCount} archived`}
					</Button>
				) : (
					<span />
				)}
				<Button size="sm" onClick={() => openEditor(null)}>
					<PlusIcon className="size-4" />
					New agent
				</Button>
			</div>

			{agents.isPending ? (
				<div className="grid gap-3 sm:grid-cols-2">
					<Skeleton className="h-40 w-full" />
					<Skeleton className="h-40 w-full" />
				</div>
			) : visible.length > 0 ? (
				<div className="grid gap-3 sm:grid-cols-2">
					{visible.map((agent) => {
						const editable = agent as unknown as EditableAgent;
						const archived = agent.status === "ARCHIVED";
						return (
							<Card key={agent.id}>
								<CardHeader>
									<div className="flex items-start justify-between gap-2">
										<div className="flex flex-col gap-1">
											<CardTitle className="text-base">{agent.name}</CardTitle>
											<CardDescription>{agent.objective}</CardDescription>
										</div>
										<div className="flex shrink-0 items-center gap-1">
											<Badge variant={STATUS_TONE[agent.status] ?? "secondary"}>
												{agent.status.toLowerCase()}
											</Badge>
											<DropdownMenu>
												<DropdownMenuTrigger
													render={
														<Button
															size="icon"
															variant="ghost"
															aria-label="Agent actions"
														/>
													}
												>
													<DotsThreeIcon className="size-4" weight="bold" />
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end" className="w-48">
													<DropdownMenuItem
														onClick={() => openEditor(editable)}
													>
														<PencilSimpleIcon className="size-4" />
														<span>Edit</span>
													</DropdownMenuItem>
													<DropdownMenuSeparator />
													<DropdownMenuItem
														disabled={
															agent.status === "ACTIVE" || setStatus.isPending
														}
														onClick={() =>
															setStatus.mutate({
																id: agent.id,
																status: "ACTIVE",
															})
														}
													>
														<CheckCircleIcon className="size-4" />
														<span>Activate</span>
													</DropdownMenuItem>
													<DropdownMenuItem
														disabled={
															agent.status !== "ACTIVE" || setStatus.isPending
														}
														onClick={() =>
															setStatus.mutate({
																id: agent.id,
																status: "PAUSED",
															})
														}
													>
														<PauseIcon className="size-4" />
														<span>Pause</span>
													</DropdownMenuItem>
													<DropdownMenuItem
														variant="destructive"
														disabled={archived || setStatus.isPending}
														onClick={() =>
															setStatus.mutate({
																id: agent.id,
																status: "ARCHIVED",
															})
														}
													>
														<ArchiveIcon className="size-4" />
														<span>Archive</span>
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
										</div>
									</div>
								</CardHeader>
								<CardContent className="flex flex-col gap-3">
									<div className="flex flex-wrap gap-2">
										<Badge variant="outline">{agent.language}</Badge>
										<Badge variant="outline">
											{agent.callPurpose.toLowerCase()}
										</Badge>
										<Badge variant="outline">{agent.maxCallSeconds}s max</Badge>
										{agent.faqs.length > 0 ? (
											<Badge variant="outline">
												{agent.faqs.length} scripted answers
											</Badge>
										) : null}
									</div>
									<div className="rounded-md border border-border p-2">
										<p className="text-muted-foreground text-xs">
											Opens every call with
										</p>
										<p className="text-sm">{agent.aiDisclosure}</p>
									</div>
									{agent.status !== "ACTIVE" ? (
										<p className="text-muted-foreground text-xs">
											Only active agents can be selected for a call.
										</p>
									) : null}
								</CardContent>
							</Card>
						);
					})}
				</div>
			) : (
				<Card>
					<CardContent className="flex flex-col items-center gap-2 py-12 text-center">
						<RobotIcon className="size-8 text-muted-foreground" />
						<p className="font-medium">No agents yet</p>
						<p className="max-w-sm text-muted-foreground text-sm">
							Create an agent to define what is said on your calls.
						</p>
						<Button size="sm" onClick={() => openEditor(null)}>
							<PlusIcon className="size-4" />
							New agent
						</Button>
					</CardContent>
				</Card>
			)}

			<AgentEditorDialog
				agent={editing}
				open={open}
				onOpenChange={(next) => {
					setOpen(next);
					if (!next) setEditing(null);
				}}
			/>
		</div>
	);
}
