"use client";

import { Button } from "@doki/ui/components/button";
import { Input } from "@doki/ui/components/input";
import { Label } from "@doki/ui/components/label";
import { useState } from "react";

/**
 * Front-end only: there is no subscribe endpoint yet, so the form says so
 * rather than pretending the address went somewhere.
 */
export default function NewsletterForm() {
	const [email, setEmail] = useState("");
	const [submitted, setSubmitted] = useState(false);

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				setSubmitted(true);
			}}
		>
			<div className="flex gap-[10px] max-[480px]:flex-col">
				<Label className="sr-only" htmlFor="newsletter-email">
					Email address
				</Label>
				<Input
					className="h-auto flex-grow border-white/10 bg-white/[0.03] text-[0.9rem] text-white placeholder:text-[#6d6d6d] focus-visible:border-white/30 focus-visible:ring-0 dark:bg-white/[0.03]"
					id="newsletter-email"
					onChange={(event) => {
						setEmail(event.target.value);
						setSubmitted(false);
					}}
					placeholder="Enter your email..."
					required
					style={{
						padding: "12px 16px",
						borderRadius: "10px",
						boxShadow: "inset 0 1px 3px rgba(0,0,0,0.25)",
					}}
					type="email"
					value={email}
				/>
				<Button
					className="h-auto bg-white font-semibold text-[0.9rem] text-neutral-900 transition-all duration-200 hover:-translate-y-0.5 hover:bg-white"
					style={{
						padding: "12px 28px",
						borderRadius: "10px",
						boxShadow: "0 12px 24px rgba(0,0,0,0.4)",
					}}
					type="submit"
				>
					Subscribe
				</Button>
			</div>
			<p
				aria-live="polite"
				className="mt-3 min-h-[1rem] text-[#9a9a9a] text-[0.8rem]"
			>
				{submitted ? "Signups are not connected yet — nothing was sent." : ""}
			</p>
		</form>
	);
}
