import { auth } from "@doki/auth";
import { resolveWorkspace } from "@doki/auth/workspace";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ComplianceCentre } from "@/components/compliance/compliance-centre";
import { CreateWorkspace } from "@/components/create-workspace";

export default async function CompliancePage() {
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
				<h1 className="font-semibold text-2xl tracking-tight">Compliance</h1>
				<p className="text-muted-foreground text-sm">
					Who may not be called, how permission was obtained, and what the
					system did on its own. Answers, not assurances.
				</p>
			</div>
			<ComplianceCentre />
		</div>
	);
}
