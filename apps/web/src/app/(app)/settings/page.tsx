import { auth } from "@doki/auth";
import { resolveWorkspace } from "@doki/auth/workspace";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@doki/ui/components/tabs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { CreateWorkspace } from "@/components/create-workspace";
import { CallingPolicyForm } from "@/components/settings/calling-policy-form";
import { TelephonyForm } from "@/components/settings/telephony-form";

export default async function SettingsPage() {
	const session = await auth.api.getSession({ headers: await headers() });

	if (!session?.user) redirect("/login");
	const organizationId = await resolveWorkspace({
		userId: session.user.id,
		sessionId: session.session.id,
		activeOrganizationId: session.session.activeOrganizationId,
	});
	if (!organizationId) return <CreateWorkspace />;

	return (
		<div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
			<div className="flex flex-col gap-1">
				<h1 className="font-semibold text-2xl tracking-tight">Settings</h1>
				<p className="text-muted-foreground text-sm">
					The rules calls are placed under, and the account they are placed
					from.
				</p>
			</div>

			<Tabs defaultValue="policy">
				<TabsList>
					<TabsTrigger value="policy">Calling policy</TabsTrigger>
					<TabsTrigger value="telephony">Telephony</TabsTrigger>
				</TabsList>

				<TabsContent value="policy">
					<div className="flex flex-col gap-4">
						<p className="text-muted-foreground text-sm">
							These rules are enforced in code before every call. They are never
							delegated to the AI.
						</p>
						<CallingPolicyForm />
					</div>
				</TabsContent>

				<TabsContent value="telephony">
					<div className="flex flex-col gap-4">
						<p className="text-muted-foreground text-sm">
							Each workspace dials from its own account, so the number, the bill
							and the DLT registration stay with whoever owns them.
						</p>
						<TelephonyForm />
					</div>
				</TabsContent>
			</Tabs>
		</div>
	);
}
