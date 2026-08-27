"use client";

import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@doki/ui/components/avatar";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@doki/ui/components/breadcrumb";
import { Button } from "@doki/ui/components/button";
import { Separator } from "@doki/ui/components/separator";
import { SidebarTrigger } from "@doki/ui/components/sidebar";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";

import { useSession } from "@/lib/auth-client";

import { ModeToggle } from "../mode-toggle";
import { ProfileDropdown } from "./profile-dropdown";

/** Route segment -> human label. Anything unmapped is title-cased. */
const SEGMENT_LABELS: Record<string, string> = {
	dashboard: "Dashboard",
	leads: "Leads",
	calls: "Calls",
	"follow-ups": "Follow-ups",
	agents: "Agents",
	settings: "Calling policy",
};

function labelFor(segment: string): string {
	if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment];
	// Detail routes carry ids; show a short form rather than a raw UUID.
	if (/^[0-9a-f]{8}-/i.test(segment)) return "Detail";
	return segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ");
}

function initials(name: string | null | undefined, email: string): string {
	if (name?.trim()) {
		return name
			.trim()
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? "")
			.join("");
	}
	return email.slice(0, 2).toUpperCase();
}

/**
 * Sticky application header.
 *
 * The breadcrumb is derived from the real pathname rather than hardcoded, so
 * it stays correct as routes are added and never claims you are somewhere you
 * are not.
 */
export function AppHeader() {
	const pathname = usePathname();
	const { data: session } = useSession();
	const user = session?.user;

	const segments = pathname.split("/").filter(Boolean);

	return (
		<header className="sticky top-0 z-50 border-b bg-card">
			<div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-2 sm:px-6">
				<div className="flex min-w-0 items-center gap-3">
					<SidebarTrigger className="[&_svg]:size-5!" />
					<Separator
						orientation="vertical"
						className="hidden h-4! data-vertical:self-center sm:block"
					/>
					<Breadcrumb className="hidden min-w-0 sm:block">
						<BreadcrumbList>
							<BreadcrumbItem>
								<BreadcrumbLink render={<Link href="/dashboard" />}>
									doki
								</BreadcrumbLink>
							</BreadcrumbItem>
							{segments.map((segment, index) => {
								const isLast = index === segments.length - 1;
								const href =
									`/${segments.slice(0, index + 1).join("/")}` as Route;
								return (
									<Fragment key={href}>
										<BreadcrumbSeparator />
										<BreadcrumbItem>
											{isLast ? (
												<BreadcrumbPage>{labelFor(segment)}</BreadcrumbPage>
											) : (
												<BreadcrumbLink render={<Link href={href} />}>
													{labelFor(segment)}
												</BreadcrumbLink>
											)}
										</BreadcrumbItem>
									</Fragment>
								);
							})}
						</BreadcrumbList>
					</Breadcrumb>
				</div>

				<div className="flex items-center gap-1.5">
					<ModeToggle />
					<ProfileDropdown
						trigger={
							<Button variant="ghost" size="icon">
								<Avatar className="size-[inherit] rounded-[inherit] after:rounded-[inherit]">
									{user?.image ? (
										<AvatarImage
											src={user.image}
											className="rounded-[inherit]"
										/>
									) : null}
									<AvatarFallback className="rounded-[inherit] text-xs">
										{user ? initials(user.name, user.email) : ""}
									</AvatarFallback>
								</Avatar>
							</Button>
						}
					/>
				</div>
			</div>
		</header>
	);
}
