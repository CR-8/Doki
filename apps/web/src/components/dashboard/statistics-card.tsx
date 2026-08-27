import { Card, CardContent, CardHeader } from "@doki/ui/components/card";
import type { ReactNode } from "react";

type StatisticsCardProps = {
	icon: ReactNode;
	value: string;
	title: string;
	/** Rendered verbatim. Pass null when there is nothing truthful to compare against. */
	detail: string | null;
	className?: string;
};

/**
 * Headline metric tile.
 *
 * `detail` is nullable on purpose: the source block hardcoded a "+18.2% than
 * last week" line, and inventing a comparison the data cannot support is worse
 * than omitting it.
 */
export function StatisticsCard({
	icon,
	value,
	title,
	detail,
	className,
}: StatisticsCardProps) {
	return (
		<Card className={className}>
			<CardHeader className="flex items-center gap-2">
				<div className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary">
					{icon}
				</div>
				<span className="text-2xl tabular-nums">{value}</span>
			</CardHeader>
			<CardContent className="flex flex-col gap-2">
				<span className="font-semibold text-base">{title}</span>
				{detail ? (
					<p className="text-muted-foreground text-sm">{detail}</p>
				) : (
					<p className="text-muted-foreground text-sm">No data yet</p>
				)}
			</CardContent>
		</Card>
	);
}
