import type { Metadata } from "next";

import AuthScreen from "@/components/auth/auth-screen";

export const metadata: Metadata = {
	title: "Sign in — doki",
	description: "Sign in to doki or create an account.",
	robots: { index: false, follow: true },
};

export default function LoginPage() {
	return <AuthScreen />;
}
