import { auth } from "@doki/auth";
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
	if (!session.session.activeOrganizationId) redirect("/calls");

	const { id } = await params;

	return (
		<div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8">
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
