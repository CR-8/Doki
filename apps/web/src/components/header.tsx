"use client";
import type { Route } from "next";
import Link from "next/link";

import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";

export default function Header() {
	const links: { to: Route; label: string }[] = [
		{ to: "/", label: "Home" },
		{ to: "/leads", label: "Leads" },
		{ to: "/calls", label: "Calls" },
		{ to: "/follow-ups", label: "Follow-ups" },
		{ to: "/agents", label: "Agents" },
		{ to: "/settings", label: "Settings" },
	];

	return (
		<div>
			<div className="flex flex-row items-center justify-between px-2 py-1">
				<nav className="flex gap-4 text-lg">
					{links.map(({ to, label }) => {
						return (
							<Link key={to} href={to}>
								{label}
							</Link>
						);
					})}
				</nav>
				<div className="flex items-center gap-2">
					<ModeToggle />
					<UserMenu />
				</div>
			</div>
			<hr />
		</div>
	);
}
