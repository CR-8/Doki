import { auth } from "@doki/auth";
import { resolveWorkspace } from "@doki/auth/workspace";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CallDetail } from "@/components/calls/call-detail";

export default async function CallDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user) redirect("/login");
	const organizationId = await resolveWorkspace({
		userId: session.user.id,
		sessionId: session.session.id,
		activeOrganizationId: session.session.activeOrganizationId,
	});
	if (!organizationId) redirect("/calls");

	const { id } = await params;

	return (
		<div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-8 sm:px-6">
			<Link
				href="/calls"
				className="text-muted-foreground text-sm hover:underline"
			>
				← Back to calls
			</Link>
			<CallDetail callId={id} />
		</div>
	);
}
