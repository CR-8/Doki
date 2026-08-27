"use client";

import { Button } from "@doki/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "@doki/ui/components/field";
import { Input } from "@doki/ui/components/input";
import { useForm } from "@tanstack/react-form";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import z from "zod";

import PasswordInput, { INPUT_CLASS } from "@/components/auth/password-input";
import SocialProviders from "@/components/auth/social-providers";
import { authClient } from "@/lib/auth-client";

import Loader from "./loader";

/** Mirrors `emailAndPassword.minPasswordLength` in packages/auth. */
const MIN_PASSWORD = 10;

export default function SignUpForm({
	onSwitchToSignIn,
}: {
	onSwitchToSignIn: () => void;
}) {
	const router = useRouter();
	const { isPending } = authClient.useSession();

	const form = useForm({
		defaultValues: {
			firstName: "",
			lastName: "",
			email: "",
			password: "",
		},
		onSubmit: async ({ value }) => {
			await authClient.signUp.email(
				{
					email: value.email,
					password: value.password,
					name: `${value.firstName} ${value.lastName}`.trim(),
				},
				{
					onSuccess: () => {
						router.push("/dashboard");
						toast.success("Sign up successful");
					},
					onError: (error) => {
						toast.error(error.error.message || error.error.statusText);
					},
				},
			);
		},
		validators: {
			onSubmit: z.object({
				firstName: z
					.string()
					.min(2, "First name must be at least 2 characters"),
				lastName: z.string().min(1, "Last name is required"),
				email: z.email("Invalid email address"),
				password: z
					.string()
					.min(
						MIN_PASSWORD,
						`Password must be at least ${MIN_PASSWORD} characters`,
					),
			}),
		},
	});

	if (isPending) {
		return <Loader />;
	}

	return (
		<div className="flex flex-col gap-5">
			<div className="mb-2 text-center">
				<h2 className="font-semibold text-2xl text-white">Sign Up Account</h2>
				<p className="mt-1 text-sm text-white/50">
					Enter your personal data to create your account.
				</p>
			</div>

			<SocialProviders />

			<form
				className="flex flex-col gap-5"
				onSubmit={(event) => {
					event.preventDefault();
					event.stopPropagation();
					form.handleSubmit();
				}}
			>
				<div className="flex gap-3">
					<form.Field name="firstName">
						{(field) => (
							<Field>
								<FieldLabel
									className="text-white/70 text-xs"
									htmlFor={field.name}
								>
									First Name
								</FieldLabel>
								<Input
									className={INPUT_CLASS}
									id={field.name}
									name={field.name}
									onBlur={field.handleBlur}
									onChange={(event) => field.handleChange(event.target.value)}
									placeholder="eg. John"
									value={field.state.value}
								/>
								<FieldError errors={field.state.meta.errors} />
							</Field>
						)}
					</form.Field>

					<form.Field name="lastName">
						{(field) => (
							<Field>
								<FieldLabel
									className="text-white/70 text-xs"
									htmlFor={field.name}
								>
									Last Name
								</FieldLabel>
								<Input
									className={INPUT_CLASS}
									id={field.name}
									name={field.name}
									onBlur={field.handleBlur}
									onChange={(event) => field.handleChange(event.target.value)}
									placeholder="eg. Francisco"
									value={field.state.value}
								/>
								<FieldError errors={field.state.meta.errors} />
							</Field>
						)}
					</form.Field>
				</div>

				<form.Field name="email">
					{(field) => (
						<Field>
							<FieldLabel
								className="text-white/70 text-xs"
								htmlFor={field.name}
							>
								Email
							</FieldLabel>
							<Input
								className={INPUT_CLASS}
								id={field.name}
								name={field.name}
								onBlur={field.handleBlur}
								onChange={(event) => field.handleChange(event.target.value)}
								placeholder="eg. johnfrans@gmail.com"
								type="email"
								value={field.state.value}
							/>
							<FieldError errors={field.state.meta.errors} />
						</Field>
					)}
				</form.Field>

				<form.Field name="password">
					{(field) => (
						<Field>
							<FieldLabel
								className="text-white/70 text-xs"
								htmlFor={field.name}
							>
								Password
							</FieldLabel>
							<PasswordInput
								id={field.name}
								name={field.name}
								onBlur={field.handleBlur}
								onChange={field.handleChange}
								placeholder="Enter your password"
								value={field.state.value}
							/>
							<FieldDescription className="text-white/30 text-xs">
								Must be at least {MIN_PASSWORD} characters.
							</FieldDescription>
							<FieldError errors={field.state.meta.errors} />
						</Field>
					)}
				</form.Field>

				<form.Subscribe
					selector={(state) => ({
						canSubmit: state.canSubmit,
						isSubmitting: state.isSubmitting,
					})}
				>
					{({ canSubmit, isSubmitting }) => (
						<Button
							className="h-auto w-full rounded-lg bg-white py-2.5 font-semibold text-black text-sm hover:bg-white/90"
							disabled={!canSubmit || isSubmitting}
							type="submit"
						>
							{isSubmitting ? "Submitting..." : "Sign Up"}
						</Button>
					)}
				</form.Subscribe>
			</form>

			<p className="text-center text-sm text-white/40">
				Already have an account?{" "}
				<button
					className="font-semibold text-white hover:underline"
					onClick={onSwitchToSignIn}
					type="button"
				>
					Log in
				</button>
			</p>
		</div>
	);
}
