"use client";

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
import { Skeleton } from "@doki/ui/components/skeleton";
import { Switch } from "@doki/ui/components/switch";
import { ShieldCheckIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

function Row({
	label,
	hint,
	children,
}: {
	label: string;
	hint?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="grid gap-2">
			<Label>{label}</Label>
			{children}
			{hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
		</div>
	);
}

export function CallingPolicyForm() {
	const settings = useQuery(orpc.settings.get.queryOptions());
	const queryClient = useQueryClient();
	const [weekend, setWeekend] = useState(false);

	useEffect(() => {
		if (settings.data) setWeekend(settings.data.allowWeekendCalls === 1);
	}, [settings.data]);

	const update = useMutation(
		orpc.settings.update.mutationOptions({
			onSuccess: () => {
				toast.success("Calling policy updated");
				queryClient.invalidateQueries({ queryKey: orpc.settings.get.key() });
				queryClient.invalidateQueries({ queryKey: orpc.leads.list.key() });
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (settings.isPending || !settings.data) {
		return <Skeleton className="h-96 w-full" />;
	}

	const data = settings.data;

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		update.mutate({
			callingWindowStart: String(form.get("callingWindowStart") ?? ""),
			callingWindowEnd: String(form.get("callingWindowEnd") ?? ""),
			defaultTimezone: String(form.get("defaultTimezone") ?? ""),
			allowWeekendCalls: weekend,
			dltEntityId: String(form.get("dltEntityId") ?? "").trim() || null,
			registeredCallerId:
				String(form.get("registeredCallerId") ?? "").trim() || null,
			maxAttemptsPerLead: Number(form.get("maxAttemptsPerLead")),
			minMinutesBetweenAttempts: Number(form.get("minMinutesBetweenAttempts")),
			maxConcurrentCalls: Number(form.get("maxConcurrentCalls")),
			monthlyMinutesCap: Number(form.get("monthlyMinutesCap")),
		});
	}

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-6">
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Calling hours</CardTitle>
					<CardDescription>
						Evaluated in each lead&apos;s own timezone, not the server&apos;s.
						Indian regulations restrict commercial calling to 09:00&ndash;21:00
						local time.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4 sm:grid-cols-2">
					<Row label="Window opens">
						<Input
							name="callingWindowStart"
							type="time"
							defaultValue={data.callingWindowStart.slice(0, 5)}
							required
						/>
					</Row>
					<Row label="Window closes">
						<Input
							name="callingWindowEnd"
							type="time"
							defaultValue={data.callingWindowEnd.slice(0, 5)}
							required
						/>
					</Row>
					<Row
						label="Default timezone"
						hint="Used when a lead has no timezone of its own."
					>
						<Input
							name="defaultTimezone"
							defaultValue={data.defaultTimezone}
							required
						/>
					</Row>
					<div className="flex items-center justify-between rounded-md border border-border p-3">
						<div className="flex flex-col">
							<span className="font-medium text-sm">Allow weekend calls</span>
							<span className="text-muted-foreground text-xs">
								Saturday and Sunday
							</span>
						</div>
						<Switch
							checked={weekend}
							onCheckedChange={(v) => setWeekend(Boolean(v))}
						/>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<div className="flex items-center gap-2">
						<ShieldCheckIcon className="size-4" />
						<CardTitle className="text-base">Regulatory identity</CardTitle>
					</div>
					<CardDescription>
						Registered by the customer under their own name. Promotional traffic
						must originate from a registered 140-series number; service and
						transactional traffic uses 1600-series.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4 sm:grid-cols-2">
					<Row label="DLT entity ID" hint="From the operator's DLT portal.">
						<Input name="dltEntityId" defaultValue={data.dltEntityId ?? ""} />
					</Row>
					<Row
						label="Registered caller ID"
						hint="The number calls originate from."
					>
						<Input
							name="registeredCallerId"
							defaultValue={data.registeredCallerId ?? ""}
							placeholder="140XXXXXXX"
						/>
					</Row>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">Attempts and capacity</CardTitle>
					<CardDescription>
						Hard ceilings. These protect both the person being called and the
						customer&apos;s budget.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4 sm:grid-cols-2">
					<Row label="Max attempts per lead">
						<Input
							name="maxAttemptsPerLead"
							type="number"
							min={1}
							max={10}
							defaultValue={data.maxAttemptsPerLead}
							required
						/>
					</Row>
					<Row
						label="Minimum gap between attempts (minutes)"
						hint="Minimum 30 minutes."
					>
						<Input
							name="minMinutesBetweenAttempts"
							type="number"
							min={30}
							max={10080}
							defaultValue={data.minMinutesBetweenAttempts}
							required
						/>
					</Row>
					<Row label="Max concurrent calls">
						<Input
							name="maxConcurrentCalls"
							type="number"
							min={1}
							max={50}
							defaultValue={data.maxConcurrentCalls}
							required
						/>
					</Row>
					<Row label="Monthly minutes cap">
						<Input
							name="monthlyMinutesCap"
							type="number"
							min={0}
							defaultValue={data.monthlyMinutesCap}
							required
						/>
					</Row>
				</CardContent>
			</Card>

			<Card className="border-dashed">
				<CardContent className="flex flex-col gap-1 p-4">
					<p className="font-medium text-sm">
						Opt-out freeze: {data.optOutFreezeDays} days
					</p>
					<p className="text-muted-foreground text-sm">
						When someone asks not to be called again, their number is suppressed
						for this long. The minimum is 90 days and it cannot be lowered.
					</p>
				</CardContent>
			</Card>

			<div className="flex justify-end">
				<Button type="submit" disabled={update.isPending}>
					{update.isPending ? "Saving..." : "Save policy"}
				</Button>
			</div>
		</form>
	);
}
