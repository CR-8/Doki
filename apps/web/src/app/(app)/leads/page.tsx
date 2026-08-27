import { auth } from "@doki/auth";
import { resolveWorkspace } from "@doki/auth/workspace";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { CreateWorkspace } from "@/components/create-workspace";
import { LeadsTable } from "@/components/leads/leads-table";

export default async function LeadsPage() {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (!session?.user) {
		redirect("/login");
	}

	const organizationId = await resolveWorkspace({
		userId: session.user.id,
		sessionId: session.session.id,
		activeOrganizationId: session.session.activeOrganizationId,
	});
	if (!organizationId) return <CreateWorkspace />;

	return (
		<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
			<div className="flex flex-col gap-1">
				<h1 className="font-semibold text-2xl tracking-tight">Leads</h1>
				<p className="text-muted-foreground text-sm">
					Every row is checked against the calling policy before a call can be
					placed. Refusals explain themselves.
				</p>
			</div>
			<LeadsTable />
		</div>
	);
}
