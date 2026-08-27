import { auth } from "@doki/auth";
import { resolveWorkspace } from "@doki/auth/workspace";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AgentsManager } from "@/components/agents/agents-manager";
import { CreateWorkspace } from "@/components/create-workspace";

export default async function AgentsPage() {
	const session = await auth.api.getSession({ headers: await headers() });

	if (!session?.user) redirect("/login");
	const organizationId = await resolveWorkspace({
		userId: session.user.id,
		sessionId: session.session.id,
		activeOrganizationId: session.session.activeOrganizationId,
	});
	if (!organizationId) return <CreateWorkspace />;

	return (
		<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
			<div className="flex flex-col gap-1">
				<h1 className="font-semibold text-2xl tracking-tight">Agents</h1>
				<p className="text-muted-foreground text-sm">
					What the AI says, and what it is never allowed to say.
				</p>
			</div>
			<AgentsManager />
		</div>
	);
}
