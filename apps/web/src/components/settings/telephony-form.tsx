"use client";

import { Badge } from "@doki/ui/components/badge";
import { Button } from "@doki/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@doki/ui/components/card";
import { Input } from "@doki/ui/components/input";
import { Label } from "@doki/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@doki/ui/components/select";
import { Skeleton } from "@doki/ui/components/skeleton";
import { Switch } from "@doki/ui/components/switch";
import {
	ArrowsClockwiseIcon,
	CheckCircleIcon,
	PlugsConnectedIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

type Provider = "twilio" | "vapi" | "mock";

const PROVIDERS: { value: Provider; label: string; hint: string }[] = [
	{
		value: "twilio",
		label: "Twilio",
		hint: "Bring your own account. Calls are billed to you and show your caller ID.",
	},
	{
		value: "vapi",
		label: "Vapi",
		hint: "Conversational voice agents. Free numbers are US-only.",
	},
	{
		value: "mock",
		label: "Simulated",
		hint: "Nothing is dialled. Useful for demos and for testing the policy engine.",
	},
];

function formatWhen(value: string | Date | null): string {
	if (!value) return "never";
	return new Date(value).toLocaleString(undefined, {
		day: "2-digit",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
}

/**
 * Per-workspace telephony credentials.
 *
 * The account belongs to the customer, so this is where they connect it. The
 * token is write-only by design — it is never sent back to the browser, and the
 * form shows only its last four characters.
 */
export function TelephonyForm() {
	const [provider, setProvider] = useState<Provider>("twilio");
	const [record, setRecord] = useState(true);
	const [fromNumber, setFromNumber] = useState("");
	const [touched, setTouched] = useState(false);
	const queryClient = useQueryClient();

	const telephony = useQuery(orpc.telephony.get.queryOptions());
	const config = telephony.data?.config ?? null;

	// Which numbers the connected account actually holds. Twilio refuses to
	// dial from anything else, so this turns a guess into a choice.
	const owned = useQuery({
		...orpc.telephony.numbers.queryOptions(),
		enabled: Boolean(config) && provider === "twilio",
	});
	const numbers = owned.data?.numbers ?? [];

	// Sync once from the server, then leave the form alone so a refetch cannot
	// stamp over something half-typed.
	useEffect(() => {
		if (!config || touched) return;
		setProvider(config.provider as Provider);
		setRecord(config.record);
		setFromNumber(config.fromNumber ?? "");
	}, [config, touched]);

	// With exactly one number on the account there is nothing to choose, so
	// choosing it is the useful thing to do rather than making them retype it.
	useEffect(() => {
		if (touched || numbers.length !== 1) return;
		const only = numbers[0] as string;
		setFromNumber((current) => (current === only ? current : only));
	}, [numbers, touched]);

	const invalidate = () => {
		queryClient.invalidateQueries({ queryKey: orpc.telephony.get.key() });
		queryClient.invalidateQueries({ queryKey: orpc.telephony.numbers.key() });
	};

	const save = useMutation(
		orpc.telephony.update.mutationOptions({
			onSuccess: () => {
				toast.success("Telephony saved", {
					description: "Run the connection test to confirm it works.",
				});
				setTouched(false);
				invalidate();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const test = useMutation(
		orpc.telephony.test.mutationOptions({
			onSuccess: (result) => {
				if (result.ok) {
					toast.success("Connected", { description: result.message });
				} else {
					toast.warning("Not usable yet", { description: result.message });
				}
				invalidate();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const disconnect = useMutation(
		orpc.telephony.disconnect.mutationOptions({
			onSuccess: () => {
				toast.success("Disconnected", {
					description: "This workspace falls back to the shared account.",
				});
				setTouched(false);
				invalidate();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (telephony.isPending) {
		return <Skeleton className="h-96 w-full" />;
	}

	const activeHint = PROVIDERS.find((p) => p.value === provider);
	const verified = Boolean(config?.verifiedAt);
	const usingWorkspace = telephony.data?.activeSource === "workspace";

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		const token = (form.get("authToken") as string)?.trim();

		save.mutate({
			provider,
			accountSid: (form.get("accountSid") as string)?.trim() || null,
			// Omitted means "keep the stored one" — the field is blank because the
			// browser never receives the secret, not because it was cleared.
			...(token ? { authToken: token } : {}),
			fromNumber: fromNumber.trim() || null,
			phoneNumberId: (form.get("phoneNumberId") as string)?.trim() || null,
			record,
		});
	}

	return (
		<div className="flex flex-col gap-4">
			<Card>
				<CardHeader>
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div className="flex flex-col gap-1">
							<CardTitle className="text-base">Connection status</CardTitle>
							<CardDescription>
								{usingWorkspace
									? "Calls go out on this workspace's own account."
									: "Calls go out on the shared account configured for the deployment."}
							</CardDescription>
						</div>
						<div className="flex items-center gap-2">
							<Badge variant={verified ? "default" : "secondary"}>
								{verified ? "verified" : "not verified"}
							</Badge>
							{config?.isTrial ? (
								<Badge variant="outline">trial account</Badge>
							) : null}
						</div>
					</div>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					<div className="grid gap-3 sm:grid-cols-3">
						<div className="flex flex-col gap-0.5">
							<span className="text-muted-foreground text-xs">In use</span>
							<span className="text-sm">
								{telephony.data?.activeProvider ?? "none"}
								{telephony.data?.activeSource
									? ` · ${telephony.data.activeSource}`
									: ""}
							</span>
						</div>
						<div className="flex flex-col gap-0.5">
							<span className="text-muted-foreground text-xs">
								Last verified
							</span>
							<span className="text-sm">
								{formatWhen(config?.verifiedAt ?? null)}
							</span>
						</div>
						<div className="flex flex-col gap-0.5">
							<span className="text-muted-foreground text-xs">
								Calling from
							</span>
							<span className="font-mono text-sm">
								{config?.fromNumber ?? "—"}
							</span>
						</div>
					</div>

					{telephony.data?.problem ? (
						<div className="flex items-start gap-2 rounded-md border border-amber-500/40 p-3">
							<WarningIcon className="mt-0.5 size-4 text-amber-600 dark:text-amber-500" />
							<p className="text-sm">{telephony.data.problem}</p>
						</div>
					) : null}

					{config?.lastError ? (
						<div className="flex items-start gap-2 rounded-md border border-destructive/40 p-3">
							<WarningIcon className="mt-0.5 size-4 text-destructive" />
							<p className="text-sm">{config.lastError}</p>
						</div>
					) : null}

					{verified && !config?.lastError ? (
						<div className="flex items-start gap-2 rounded-md border border-border p-3">
							<CheckCircleIcon className="mt-0.5 size-4" />
							<p className="text-sm">
								Credentials confirmed against the provider.
							</p>
						</div>
					) : null}

					<div className="flex flex-wrap gap-2">
						<Button
							size="sm"
							variant="outline"
							disabled={test.isPending || !config}
							onClick={() => test.mutate({})}
						>
							<PlugsConnectedIcon className="size-4" />
							{test.isPending ? "Testing..." : "Test connection"}
						</Button>
						{config ? (
							<Button
								size="sm"
								variant="destructive"
								disabled={disconnect.isPending}
								onClick={() => disconnect.mutate({})}
							>
								{disconnect.isPending ? "Disconnecting..." : "Disconnect"}
							</Button>
						) : null}
					</div>
				</CardContent>
			</Card>

			<Card>
				<form onSubmit={handleSubmit}>
					<CardHeader>
						<CardTitle className="text-base">Credentials</CardTitle>
						<CardDescription>
							Stored encrypted. The token is never sent back to this page —
							leave it blank to keep the one on file.
						</CardDescription>
					</CardHeader>

					<CardContent className="flex flex-col gap-4">
						<div className="grid gap-2">
							<Label>Provider</Label>
							<Select
								value={provider}
								onValueChange={(v) => {
									setProvider((v ?? "twilio") as Provider);
									setTouched(true);
								}}
							>
								<SelectTrigger className="w-full sm:w-[260px]">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{PROVIDERS.map((p) => (
										<SelectItem key={p.value} value={p.value}>
											{p.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<p className="text-muted-foreground text-xs">
								{activeHint?.hint}
							</p>
						</div>

						{provider === "twilio" ? (
							<>
								<div className="grid gap-3 sm:grid-cols-2">
									<div className="grid gap-2">
										<Label htmlFor="accountSid">Account SID</Label>
										<Input
											id="accountSid"
											name="accountSid"
											defaultValue={config?.accountSid ?? ""}
											placeholder="AC..."
											onChange={() => setTouched(true)}
										/>
									</div>
									<div className="grid gap-2">
										<Label htmlFor="authToken">Auth token</Label>
										<Input
											id="authToken"
											name="authToken"
											type="password"
											autoComplete="off"
											placeholder={
												config?.authTokenLast4
													? `•••••••• ${config.authTokenLast4}`
													: "Paste the auth token"
											}
											onChange={() => setTouched(true)}
										/>
									</div>
								</div>

								<div className="grid gap-2 sm:w-[320px]">
									<div className="flex items-center justify-between gap-2">
										<Label htmlFor="fromNumber">Calling from</Label>
										{config ? (
											<Button
												type="button"
												size="xs"
												variant="ghost"
												disabled={owned.isFetching}
												onClick={() => owned.refetch()}
											>
												<ArrowsClockwiseIcon className="size-3.5" />
												{owned.isFetching ? "Loading..." : "Refresh"}
											</Button>
										) : null}
									</div>

									{numbers.length > 0 ? (
										<Select
											value={fromNumber}
											onValueChange={(v) => {
												setFromNumber(v ?? "");
												setTouched(true);
											}}
										>
											<SelectTrigger id="fromNumber">
												<SelectValue placeholder="Pick a number" />
											</SelectTrigger>
											<SelectContent>
												{numbers.map((number) => (
													<SelectItem key={number} value={number}>
														{number}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									) : (
										<Input
											id="fromNumber"
											value={fromNumber}
											placeholder="+91 98765 43210"
											onChange={(e) => {
												setFromNumber(e.target.value);
												setTouched(true);
											}}
										/>
									)}

									{numbers.length > 0 ? (
										<p className="text-muted-foreground text-xs">
											{numbers.length === 1
												? "The only number this account owns."
												: `${numbers.length} numbers on this account.`}{" "}
											For Indian promotional calls it also has to be the
											registered 140-series number.
										</p>
									) : (
										<p className="text-muted-foreground text-xs">
											{owned.data?.problem ??
												"Save the credentials to load the numbers this account owns."}
										</p>
									)}
								</div>
							</>
						) : null}

						{provider === "vapi" ? (
							<div className="grid gap-3 sm:grid-cols-2">
								<div className="grid gap-2">
									<Label htmlFor="authToken">API key</Label>
									<Input
										id="authToken"
										name="authToken"
										type="password"
										autoComplete="off"
										placeholder={
											config?.authTokenLast4
												? `•••••••• ${config.authTokenLast4}`
												: "Paste the Vapi API key"
										}
										onChange={() => setTouched(true)}
									/>
								</div>
								<div className="grid gap-2">
									<Label htmlFor="phoneNumberId">Phone number id</Label>
									<Input
										id="phoneNumberId"
										name="phoneNumberId"
										defaultValue={config?.phoneNumberId ?? ""}
										placeholder="Optional — uses the account default"
										onChange={() => setTouched(true)}
									/>
								</div>
							</div>
						) : null}

						{provider === "mock" ? (
							<p className="text-muted-foreground text-sm">
								Nothing to configure. Calls are simulated end to end, which
								still exercises the calling policy, follow-ups and analysis.
							</p>
						) : null}

						{provider !== "mock" ? (
							<div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
								<div className="flex flex-col">
									<span className="text-sm">Record calls</span>
									<span className="text-muted-foreground text-xs">
										Recording consent rules are yours to satisfy. Trial accounts
										reject this parameter and will call without it.
									</span>
								</div>
								<Switch
									checked={record}
									onCheckedChange={(checked) => {
										setRecord(Boolean(checked));
										setTouched(true);
									}}
								/>
							</div>
						) : null}
					</CardContent>

					<CardContent className="flex justify-end gap-2 pt-0">
						<Button type="submit" disabled={save.isPending}>
							{save.isPending ? "Saving..." : "Save credentials"}
						</Button>
					</CardContent>
				</form>
			</Card>
		</div>
	);
}
