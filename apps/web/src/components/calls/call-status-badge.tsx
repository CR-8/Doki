import { Badge } from "@doki/ui/components/badge";
import {
	CheckCircleIcon,
	PhoneDisconnectIcon,
	PhoneIcon,
	ProhibitIcon,
	QueueIcon,
	VoicemailIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { ComponentType } from "react";

type Variant = "default" | "secondary" | "destructive" | "outline";

const STATUS: Record<
	string,
	{
		label: string;
		variant: Variant;
		icon: ComponentType<{ className?: string }>;
	}
> = {
	QUEUED: { label: "Queued", variant: "secondary", icon: QueueIcon },
	DIALING: { label: "Dialing", variant: "secondary", icon: PhoneIcon },
	RINGING: { label: "Ringing", variant: "secondary", icon: PhoneIcon },
	IN_PROGRESS: { label: "In progress", variant: "default", icon: PhoneIcon },
	COMPLETED: { label: "Completed", variant: "outline", icon: CheckCircleIcon },
	FAILED: { label: "Failed", variant: "destructive", icon: WarningCircleIcon },
	BUSY: { label: "Busy", variant: "secondary", icon: PhoneDisconnectIcon },
	NO_ANSWER: {
		label: "No answer",
		variant: "secondary",
		icon: PhoneDisconnectIcon,
	},
	VOICEMAIL: { label: "Voicemail", variant: "secondary", icon: VoicemailIcon },
	CANCELED: { label: "Canceled", variant: "secondary", icon: ProhibitIcon },
};

/** Technical call state. Never conflated with the sales outcome. */
export function CallStatusBadge({ status }: { status: string }) {
	const entry = STATUS[status] ?? {
		label: status,
		variant: "secondary" as Variant,
		icon: WarningCircleIcon,
	};
	const Icon = entry.icon;

	return (
		<Badge variant={entry.variant} className="gap-1">
			<Icon className="size-3.5" />
			{entry.label}
		</Badge>
	);
}

const OUTCOME: Record<string, { label: string; variant: Variant }> = {
	UNKNOWN: { label: "Unknown", variant: "secondary" },
	INTERESTED: { label: "Interested", variant: "default" },
	NOT_INTERESTED: { label: "Not interested", variant: "secondary" },
	CALLBACK_REQUESTED: { label: "Callback", variant: "outline" },
	QUALIFIED: { label: "Qualified", variant: "default" },
	MEETING_BOOKED: { label: "Meeting booked", variant: "default" },
	WRONG_NUMBER: { label: "Wrong number", variant: "secondary" },
	DO_NOT_CALL: { label: "Do not call", variant: "destructive" },
};

/** Business result. Proposed by AI, confirmed by application code. */
export function OutcomeBadge({ outcome }: { outcome: string }) {
	const entry = OUTCOME[outcome] ?? {
		label: outcome,
		variant: "secondary" as Variant,
	};
	if (outcome === "UNKNOWN") {
		return <span className="text-muted-foreground text-xs">—</span>;
	}
	return <Badge variant={entry.variant}>{entry.label}</Badge>;
}

export function formatDuration(seconds: number): string {
	if (!seconds) return "—";
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatInr(value: number | string): string {
	const n = typeof value === "string" ? Number(value) : value;
	if (!Number.isFinite(n) || n === 0) return "₹0";
	return `₹${n.toFixed(2)}`;
}
