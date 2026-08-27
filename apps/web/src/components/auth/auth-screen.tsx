"use client";

import Link from "next/link";
import { useState } from "react";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";

import { AUTH_GRADIENT, AUTH_PANELS, type AuthMode } from "./auth-data";

function StepCard({
	number,
	text,
	active,
}: {
	number: number;
	text: string;
	active: boolean;
}) {
	return (
		<div
			className={`flex flex-1 flex-col gap-8 rounded-xl p-6 ${
				active ? "bg-white" : "bg-white/10"
			}`}
		>
			<span
				className={`flex size-6 items-center justify-center rounded-full font-semibold text-xs ${
					active ? "bg-black text-white" : "bg-white/20 text-white"
				}`}
			>
				{number}
			</span>
			<span
				className={`font-medium text-sm leading-tight ${
					active ? "text-black" : "text-white/60"
				}`}
			>
				{text}
			</span>
		</div>
	);
}

export default function AuthScreen() {
	const [mode, setMode] = useState<AuthMode>("signUp");
	const panel = AUTH_PANELS[mode];

	return (
		<div className="dark flex h-svh w-full overflow-hidden bg-black">
			<aside
				className={`@container relative hidden h-full w-[60%] flex-col justify-end gap-6 p-8 pb-10 transition-all duration-500 lg:flex ${AUTH_GRADIENT}`}
			>
				<Link
					aria-label="doki.ai"
					className="absolute top-8 left-8 inline-flex items-center gap-[9px] font-semibold text-[15.5px] text-white tracking-[-0.03em]"
					href="/"
				>
					<svg
						aria-hidden="true"
						className="size-[22px]"
						fill="currentColor"
						viewBox="0 0 24 24"
					>
						<g transform="rotate(-30 12 12)">
							<circle cx="7.3" cy="3.2" r="1.45" />
							<rect height="14.6" rx="1.8" width="3.6" x="5.5" y="4.7" />
							<rect height="14.6" rx="1.8" width="3.6" x="14.9" y="4.7" />
							<circle cx="16.7" cy="20.8" r="1.45" />
						</g>
					</svg>
					<span>
						doki<span className="font-normal">.ai</span>
					</span>
				</Link>

				<div className="flex items-end gap-8 py-6">
					<h1 className="w-[50%] font-semibold text-[3.5cqw] text-white leading-none tracking-tight">
						{panel.heading.split("\n").map((line) => (
							<span className="block" key={line}>
								{line}
							</span>
						))}
					</h1>
					<p className="max-w-[50%] text-base text-white/70 leading-relaxed">
						{panel.description}
					</p>
				</div>

				<div className="flex gap-4">
					{panel.steps.map((step) => (
						<StepCard
							active={step.active}
							key={step.number}
							number={step.number}
							text={step.text}
						/>
					))}
				</div>
			</aside>

			<main className="flex h-full w-full items-center justify-center overflow-y-auto px-6 py-10 lg:w-[40%]">
				<div className="w-full max-w-[380px] lg:w-[75%] lg:max-w-none">
					{mode === "signIn" ? (
						<SignInForm onSwitchToSignUp={() => setMode("signUp")} />
					) : (
						<SignUpForm onSwitchToSignIn={() => setMode("signIn")} />
					)}
				</div>
			</main>
		</div>
	);
}
