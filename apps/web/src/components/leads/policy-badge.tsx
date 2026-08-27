"use client";

import { Badge } from "@doki/ui/components/badge";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@doki/ui/components/tooltip";
import {
	CheckCircleIcon,
	ClockIcon,
	ProhibitIcon,
	ShieldWarningIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import type { ComponentType } from "react";

export type PolicyDecisionView =
	| { allowed: true }
	| {
			allowed: false;
			code: string;
			reason: string;
			retryAt: string | Date | null;
	  };

type DenyPresentation = {
	label: string;
	icon: ComponentType<{ className?: string }>;
	/** Legal blocks read as hard stops; operational ones as "not right now". */
	tone: "legal" | "operational";
};

const DENY_PRESENTATION: Record<string, DenyPresentation> = {
	LEAD_SUPPRESSED: { label: "Suppressed", icon: ProhibitIcon, tone: "legal" },
	ON_SUPPRESSION_LIST: {
		label: "Do not call",
		icon: ProhibitIcon,
		tone: "legal",
	},
	NO_CONSENT: { label: "No consent", icon: ShieldWarningIcon, tone: "legal" },
	DND_REGISTERED: { label: "On DND", icon: ProhibitIcon, tone: "legal" },
	DND_SCRUB_STALE: {
		label: "Scrub expired",
		icon: ShieldWarningIcon,
		tone: "legal",
	},
	INVALID_PHONE: {
		label: "Bad number",
		icon: WarningCircleIcon,
		tone: "legal",
	},

	OUTSIDE_CALLING_WINDOW: {
		label: "Outside hours",
		icon: ClockIcon,
		tone: "operational",
	},
	WEEKEND_BLOCKED: { label: "Weekend", icon: ClockIcon, tone: "operational" },
	RETRY_TOO_SOON: { label: "Too soon", icon: ClockIcon, tone: "operational" },
	MAX_ATTEMPTS_REACHED: {
		label: "Max attempts",
		icon: WarningCircleIcon,
		tone: "operational",
	},
	CONCURRENCY_LIMIT: {
		label: "At capacity",
		icon: WarningCircleIcon,
		tone: "operational",
	},
	MONTHLY_CAP_REACHED: {
		label: "Quota used",
		icon: WarningCircleIcon,
		tone: "operational",
	},
	SETTINGS_MISSING: {
		label: "Not configured",
		icon: WarningCircleIcon,
		tone: "operational",
	},
	LEAD_NOT_FOUND: {
		label: "Not found",
		icon: WarningCircleIcon,
		tone: "operational",
	},
};

const FALLBACK: DenyPresentation = {
	label: "Blocked",
	icon: WarningCircleIcon,
	tone: "operational",
};

function formatRetry(retryAt: string | Date | null): string | null {
	if (!retryAt) return null;
	const date = typeof retryAt === "string" ? new Date(retryAt) : retryAt;
	if (Number.isNaN(date.getTime())) return null;
	return date.toLocaleString(undefined, {
		weekday: "short",
		hour: "2-digit",
		minute: "2-digit",
		hour12: true,
	});
}

/**
 * Renders a policy verdict. A refusal always explains itself — the reason
 * string comes straight from the engine, so what the user reads is exactly
 * what the audit log recorded.
 */
export function PolicyBadge({ decision }: { decision: PolicyDecisionView }) {
	if (decision.allowed) {
		return (
			<Badge
				variant="outline"
				className="gap-1 border-emerald-600/30 text-emerald-700 dark:text-emerald-400"
			>
				<CheckCircleIcon className="size-3.5" weight="fill" />
				Callable
			</Badge>
		);
	}

	const presentation = DENY_PRESENTATION[decision.code] ?? FALLBACK;
	const Icon = presentation.icon;
	const retry = formatRetry(decision.retryAt);

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger
					render={
						<Badge
							variant={
								presentation.tone === "legal" ? "destructive" : "secondary"
							}
							className="cursor-help gap-1"
						/>
					}
				>
					<Icon className="size-3.5" />
					{presentation.label}
				</TooltipTrigger>
				<TooltipContent className="max-w-xs">
					<p className="text-sm">{decision.reason}</p>
					{retry ? (
						<p className="mt-1 text-xs opacity-80">Callable again {retry}</p>
					) : null}
					<p className="mt-1 font-mono text-[10px] opacity-60">
						{decision.code}
					</p>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
