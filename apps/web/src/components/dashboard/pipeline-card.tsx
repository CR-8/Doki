"use client";

import { Button } from "@doki/ui/components/button";
import { Card, CardContent } from "@doki/ui/components/card";
import { Progress } from "@doki/ui/components/progress";
import { Separator } from "@doki/ui/components/separator";
import { WarningIcon } from "@phosphor-icons/react";
import Link from "next/link";

type Props = {
	leads: {
		total: number;
		withConsent: number;
		suppressed: number;
		untouched: number;
	};
	followUps: { pending: number; dueNow: number; failed: number };
	agents: { total: number; active: number };
	compliance: { suppressionEntries: number; suppressedLeads: number };
	className?: string;
};

function Row({ label, value }: { label: string; value: string | number }) {
	return (
		<div className="flex items-center justify-between text-sm">
			<span className="text-muted-foreground">{label}</span>
			<span className="font-mono tabular-nums">{value}</span>
		</div>
	);
}

/**
 * Pipeline and compliance posture.
 *
 * Consent coverage sits at the top because it is the gate that decides which
 * of these leads are legally callable — a large lead count with low consent is
 * a smaller pipeline than it looks.
 */
export function PipelineCard({
	leads,
	followUps,
	agents,
	compliance,
	className,
}: Props) {
	const consentPct =
		leads.total > 0 ? Math.round((leads.withConsent / leads.total) * 100) : 0;

	return (
		<Card className={className}>
			<CardContent className="flex flex-col gap-5">
				<div className="flex items-center justify-between">
					<span className="font-semibold text-lg">Pipeline</span>
					<Button
						size="sm"
						variant="ghost"
						nativeButton={false}
						render={<Link href="/leads" />}
					>
						View leads
					</Button>
				</div>

				<div className="flex flex-col gap-1.5">
					<div className="flex items-center justify-between text-sm">
						<span className="text-muted-foreground">Consent coverage</span>
						<span className="font-mono tabular-nums">
							{leads.withConsent}/{leads.total}
						</span>
					</div>
					<Progress value={consentPct} />
					<span className="text-muted-foreground text-xs">
						Promotional calls are refused without recorded consent.
					</span>
				</div>

				<Separator />

				<div className="flex flex-col gap-2">
					<Row label="Not yet contacted" value={leads.untouched} />
					<Row label="Follow-ups pending" value={followUps.pending} />
					<Row label="On do-not-call" value={compliance.suppressionEntries} />
					<Row label="Suppressed leads" value={leads.suppressed} />
					<Row
						label="Active agents"
						value={`${agents.active}/${agents.total}`}
					/>
				</div>

				{followUps.failed > 0 ? (
					<div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
						<WarningIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
						<span className="text-sm">
							{followUps.failed} follow-up{followUps.failed === 1 ? "" : "s"}{" "}
							failed
						</span>
					</div>
				) : null}

				{agents.active === 0 ? (
					<div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
						<WarningIcon className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
						<span className="text-sm">
							No active agent — calls cannot be placed.
						</span>
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}
