"use client";

import { Button } from "@doki/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@doki/ui/components/card";
import { Input } from "@doki/ui/components/input";
import { Label } from "@doki/ui/components/label";
import { BuildingsIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";

function slugify(value: string): string {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);
}

/**
 * First-run workspace creation. Every customer-owned row is scoped to an
 * organization, so a user without one cannot reach any tenant data at all —
 * the API refuses before a query is even built.
 */
export function CreateWorkspace() {
	const [name, setName] = useState("");
	const [pending, setPending] = useState(false);
	const router = useRouter();

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const trimmed = name.trim();
		if (!trimmed) return;

		setPending(true);
		try {
			const slug = `${slugify(trimmed)}-${Math.random().toString(36).slice(2, 7)}`;
			const created = await authClient.organization.create({
				name: trimmed,
				slug,
			});

			if (created.error) {
				toast.error(created.error.message ?? "Could not create workspace");
				return;
			}

			const organizationId = created.data?.id;
			if (organizationId) {
				await authClient.organization.setActive({ organizationId });
			}

			toast.success("Workspace created");
			router.refresh();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not create workspace",
			);
		} finally {
			setPending(false);
		}
	}

	return (
		<div className="flex min-h-[60vh] items-center justify-center">
			<Card className="w-full max-w-md">
				<CardHeader>
					<div className="mb-2 flex size-10 items-center justify-center rounded-md border border-border">
						<BuildingsIcon className="size-5" />
					</div>
					<CardTitle>Create your workspace</CardTitle>
					<CardDescription>
						Leads, calls, consent records and audit history all live inside a
						workspace.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit} className="flex flex-col gap-4">
						<div className="grid gap-2">
							<Label htmlFor="workspace-name">Workspace name</Label>
							<Input
								id="workspace-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="Acme Sales"
								required
								autoFocus
							/>
						</div>
						<Button type="submit" disabled={pending || !name.trim()}>
							{pending ? "Creating..." : "Create workspace"}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
