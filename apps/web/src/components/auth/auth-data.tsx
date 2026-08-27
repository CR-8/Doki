import type { ReactNode } from "react";

export type AuthMode = "signUp" | "signIn";

type Step = { number: number; text: string; active: boolean };

type Panel = {
	heading: string;
	description: string;
	steps: Step[];
};

/**
 * Social sign-in is rendered from this list. It is empty because
 * `packages/auth` only enables `emailAndPassword` — add a provider to
 * `socialProviders` there (plus its client id/secret) and then add an entry
 * here to light the buttons up.
 */
export type SocialProvider = {
	name: "google" | "github";
	label: string;
	icon: ReactNode;
};

export const SOCIAL_PROVIDERS: SocialProvider[] = [];

export const GOOGLE_ICON = (
	<svg
		aria-hidden="true"
		height="18"
		viewBox="0 0 48 48"
		width="18"
		xmlns="http://www.w3.org/2000/svg"
	>
		<path
			d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"
			fill="#FFC107"
		/>
		<path
			d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"
			fill="#FF3D00"
		/>
		<path
			d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"
			fill="#4CAF50"
		/>
		<path
			d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"
			fill="#1976D2"
		/>
	</svg>
);

export const GITHUB_ICON = (
	<svg
		aria-hidden="true"
		fill="currentColor"
		height="18"
		viewBox="0 0 16 16"
		width="18"
		xmlns="http://www.w3.org/2000/svg"
	>
		<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8" />
	</svg>
);

export const AUTH_PANELS: Record<AuthMode, Panel> = {
	signUp: {
		heading: "Get Started\nwith doki",
		description: "Three short steps and your first agent can start dialling.",
		steps: [
			{ number: 1, text: "Sign up your account", active: true },
			{ number: 2, text: "Set up your workspace", active: false },
			{ number: 3, text: "Import your first leads", active: false },
		],
	},
	signIn: {
		heading: "Welcome\nBack",
		description: "Sign in to pick up where your agents left off.",
		steps: [
			{ number: 1, text: "Sign in to your account", active: true },
			{ number: 2, text: "Open your workspace", active: false },
			{ number: 3, text: "Review last night's calls", active: false },
		],
	},
};

/** Swap this single string to re-skin the left panel. */
export const AUTH_GRADIENT =
	"bg-[#0A2B1C] bg-[radial-gradient(ellipse_at_65%_25%,#2D7A55_0%,#1A5C3E_35%,#0E3D27_60%,#0A2B1C_100%)]";
