"use client";

import { Button } from "@doki/ui/components/button";
import { FieldSeparator } from "@doki/ui/components/field";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";

import { SOCIAL_PROVIDERS } from "./auth-data";

/**
 * Renders nothing until a provider is configured on the server, so the screen
 * never shows a button that cannot complete a sign-in.
 */
export default function SocialProviders({
	callbackURL = "/dashboard",
}: {
	callbackURL?: string;
}) {
	if (SOCIAL_PROVIDERS.length === 0) {
		return null;
	}

	return (
		<>
			<div className="flex gap-3">
				{SOCIAL_PROVIDERS.map((provider) => (
					<Button
						className="h-auto flex-1 gap-2 rounded-lg border-white/10 py-2.5 text-sm text-white hover:bg-white/5"
						key={provider.name}
						onClick={async () => {
							await authClient.signIn.social(
								{ provider: provider.name, callbackURL },
								{
									onError: (error) => {
										toast.error(error.error.message || error.error.statusText);
									},
								},
							);
						}}
						type="button"
						variant="outline"
					>
						{provider.icon}
						<span>{provider.label}</span>
					</Button>
				))}
			</div>

			<FieldSeparator className="[&_[data-slot=field-separator-content]]:bg-black [&_[data-slot=field-separator-content]]:text-white/40">
				Or
			</FieldSeparator>
		</>
	);
}
