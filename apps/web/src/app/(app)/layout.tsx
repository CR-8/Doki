import { FollowUpHeartbeat } from "@/components/follow-up-heartbeat";
import Header from "@/components/header";

export default function AppLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<div className="grid h-svh grid-rows-[auto_1fr]">
			<Header />
			{children}
			{/* No background worker on this platform — an open console drives the
			    follow-up runner. Renders nothing. */}
			<FollowUpHeartbeat />
		</div>
	);
}
