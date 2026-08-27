"use client";

import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@doki/ui/components/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@doki/ui/components/dropdown-menu";
import {
	BuildingsIcon,
	GearIcon,
	RobotIcon,
	SignOutIcon,
	UserIcon,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import { toast } from "sonner";

import {
	authClient,
	useActiveOrganization,
	useSession,
} from "@/lib/auth-client";

type Props = {
	trigger: ReactElement;
	align?: "start" | "center" | "end";
};

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
 * Account menu, driven entirely by the live session.
 *
 * No placeholder identity: if the session has not resolved yet the menu shows
 * nothing rather than a stand-in name, because a wrong name in an account menu
 * is the kind of detail that makes a prospect doubt the rest of the product.
 */
export function ProfileDropdown({ trigger, align = "end" }: Props) {
	const router = useRouter();
	const { data: session } = useSession();
	const { data: activeOrg } = useActiveOrganization();

	const user = session?.user;

	async function handleSignOut() {
		try {
			await authClient.signOut();
			router.push("/login");
			router.refresh();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not sign out",
			);
		}
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger render={trigger} />
			<DropdownMenuContent className="w-72" align={align}>
				{user ? (
					<>
						<DropdownMenuGroup>
							<DropdownMenuLabel className="flex items-center gap-3 px-3 py-2.5 font-normal">
								<Avatar>
									{user.image ? (
										<AvatarImage src={user.image} alt={user.name} />
									) : null}
									<AvatarFallback>
										{initials(user.name, user.email)}
									</AvatarFallback>
								</Avatar>
								<div className="flex min-w-0 flex-1 flex-col items-start">
									<span className="truncate font-semibold text-sm">
										{user.name}
									</span>
									<span className="truncate text-muted-foreground text-xs">
										{user.email}
									</span>
								</div>
							</DropdownMenuLabel>
						</DropdownMenuGroup>

						{activeOrg ? (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuLabel className="flex items-center gap-2 px-3 py-2 font-normal text-muted-foreground text-xs">
									<BuildingsIcon className="size-3.5" />
									<span className="truncate">{activeOrg.name}</span>
								</DropdownMenuLabel>
							</>
						) : null}

						<DropdownMenuSeparator />
					</>
				) : null}

				<DropdownMenuGroup>
					<DropdownMenuItem onClick={() => router.push("/agents")}>
						<RobotIcon className="size-4" />
						<span>Agents</span>
					</DropdownMenuItem>
					<DropdownMenuItem onClick={() => router.push("/settings")}>
						<GearIcon className="size-4" />
						<span>Calling policy</span>
					</DropdownMenuItem>
				</DropdownMenuGroup>

				<DropdownMenuSeparator />

				<DropdownMenuGroup>
					<DropdownMenuItem variant="destructive" onClick={handleSignOut}>
						<SignOutIcon className="size-4" />
						<span>Sign out</span>
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export { UserIcon };
