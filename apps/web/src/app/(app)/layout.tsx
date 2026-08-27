import { SidebarInset, SidebarProvider } from "@doki/ui/components/sidebar";

import { FollowUpHeartbeat } from "@/components/follow-up-heartbeat";
import { AppHeader } from "@/components/shell/app-header";
import { AppSidebar } from "@/components/shell/app-sidebar";

export default function AppLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex min-h-dvh flex-col">
				<AppHeader />
				<main className="flex-1">{children}</main>
				<footer className="border-t">
					<div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 text-muted-foreground max-sm:flex-col sm:gap-6 sm:px-6">
						<p className="text-balance text-sm max-sm:text-center">
							{`© ${new Date().getFullYear()} doki`} — every call is logged,
							policy-checked and auditable.
						</p>
						<p className="text-xs">
							Calling hours and consent are enforced in code, not by the AI.
						</p>
					</div>
				</footer>
				{/* No background worker on this platform — an open console drives the
				    follow-up runner. Renders nothing. */}
				<FollowUpHeartbeat />
			</SidebarInset>
		</SidebarProvider>
	);
}
