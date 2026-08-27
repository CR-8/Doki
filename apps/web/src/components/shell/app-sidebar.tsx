"use client";

import { Badge } from "@doki/ui/components/badge";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@doki/ui/components/sidebar";
import {
	CalendarCheckIcon,
	ChartLineUpIcon,
	GearIcon,
	PhoneCallIcon,
	RobotIcon,
	ShieldCheckIcon,
	UsersIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { orpc } from "@/utils/orpc";

type NavItem = {
	href: Route;
	label: string;
	icon: React.ComponentType<{ className?: string }>;
	/** Reads a live count off the dashboard payload; no placeholder numbers. */
	badge?: (d: NonNullable<ReturnType<typeof useOverview>["data"]>) => number;
};

function useOverview() {
	return useQuery(
		orpc.dashboard.overview.queryOptions({ input: { days: 30 } }),
	);
}

const WORKSPACE: NavItem[] = [
	{ href: "/dashboard", label: "Dashboard", icon: ChartLineUpIcon },
	{
		href: "/leads",
		label: "Leads",
		icon: UsersIcon,
		badge: (d) => d.leads.untouched,
	},
	{ href: "/calls", label: "Calls", icon: PhoneCallIcon },
	{
		href: "/follow-ups",
		label: "Follow-ups",
		icon: CalendarCheckIcon,
		badge: (d) => d.followUps.dueNow,
	},
];

const CONFIGURE: NavItem[] = [
	{ href: "/agents", label: "Agents", icon: RobotIcon },
	{ href: "/settings", label: "Calling policy", icon: GearIcon },
];

/**
 * Primary navigation.
 *
 * Badges are wired to live counts — leads never contacted, follow-ups due now.
 * A badge that showed a hardcoded number would be worse than no badge: it
 * teaches the user to ignore the one signal meant to pull them somewhere.
 */
export function AppSidebar() {
	const pathname = usePathname();
	const overview = useOverview();

	const renderItem = (item: NavItem) => {
		const Icon = item.icon;
		const isActive =
			pathname === item.href || pathname.startsWith(`${item.href}/`);
		const count = overview.data && item.badge ? item.badge(overview.data) : 0;

		return (
			<SidebarMenuItem key={item.href}>
				<SidebarMenuButton
					isActive={isActive}
					render={<Link href={item.href} />}
				>
					<Icon className="size-4" />
					<span>{item.label}</span>
				</SidebarMenuButton>
				{count > 0 ? (
					<SidebarMenuBadge className="top-1/2! right-2 -translate-y-1/2! rounded-full bg-primary/10">
						{count}
					</SidebarMenuBadge>
				) : null}
			</SidebarMenuItem>
		);
	};

	return (
		<Sidebar>
			<SidebarHeader className="px-4 py-4">
				<div className="flex items-center gap-2">
					<div className="flex size-7 items-center justify-center rounded-md bg-foreground text-background">
						<PhoneCallIcon className="size-4" weight="fill" />
					</div>
					<span className="font-semibold text-lg tracking-tight">doki</span>
				</div>
			</SidebarHeader>

			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>Workspace</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>{WORKSPACE.map(renderItem)}</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>

				<SidebarGroup>
					<SidebarGroupLabel>Configure</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>{CONFIGURE.map(renderItem)}</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>

				{/* Compliance posture, surfaced permanently rather than buried in
				    settings — it is the thing that makes automated calling sellable. */}
				{overview.data ? (
					<SidebarGroup className="mt-auto">
						<SidebarGroupLabel>Compliance</SidebarGroupLabel>
						<SidebarGroupContent className="px-2">
							<div className="flex flex-col gap-2 rounded-lg border border-border p-3">
								<div className="flex items-center gap-2">
									<ShieldCheckIcon className="size-4" />
									<span className="font-medium text-sm">Policy active</span>
								</div>
								<div className="flex items-center justify-between text-xs">
									<span className="text-muted-foreground">With consent</span>
									<Badge variant="outline" className="font-mono">
										{overview.data.leads.withConsent}/
										{overview.data.leads.total}
									</Badge>
								</div>
								<div className="flex items-center justify-between text-xs">
									<span className="text-muted-foreground">Do-not-call</span>
									<Badge variant="outline" className="font-mono">
										{overview.data.compliance.suppressionEntries}
									</Badge>
								</div>
							</div>
						</SidebarGroupContent>
					</SidebarGroup>
				) : null}
			</SidebarContent>
		</Sidebar>
	);
}
