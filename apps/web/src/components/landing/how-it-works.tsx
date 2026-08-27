import { Card, CardContent } from "@doki/ui/components/card";
import { cn } from "@doki/ui/lib/utils";

import { LANDING_CARD } from "./card-surface";

const STEPS = [
	{
		index: "01",
		title: "Bring your leads in",
		body: "Push leads from your CRM or a CSV. doki stores how consent was obtained and which timezone the person sits in — both are load-bearing later.",
	},
	{
		index: "02",
		title: "An agent makes the first call",
		body: "Your script, your voice, your calling window. The agent qualifies, handles the usual objections, and books time when there is intent.",
	},
	{
		index: "03",
		title: "The outcome lands on the lead",
		body: "Recording, transcript, and a confirmed sales outcome — with the next follow-up already scheduled or the number suppressed for good.",
	},
];

export default function HowItWorks() {
	return (
		<section className="how-it-works" id="how-it-works">
			<div className="mx-auto max-w-3xl px-6 py-20 md:py-28 lg:max-w-5xl">
				<div className="mb-10 max-w-xl md:mb-14">
					<span className="text-[#9a9a9a] text-[12.5px] tracking-[-0.01em]">
						How it works
					</span>
					<h2 className="mt-3 font-medium text-3xl text-white leading-[1.12] tracking-[-0.045em] md:text-[40px]">
						Three steps from list to booked call.
					</h2>
					<p className="mt-4 text-[#9a9a9a] text-[15.5px] leading-[1.55] tracking-[-0.015em]">
						No new phone system, no dialler rota, no spreadsheet of who was
						called when.
					</p>
				</div>

				<ol className="grid gap-3 sm:grid-cols-3">
					{STEPS.map((step) => (
						<li key={step.index}>
							<Card className={cn(LANDING_CARD, "h-full")}>
								<CardContent className="flex h-full flex-col gap-4 pt-6">
									<span
										className="text-4xl text-[#9a9a9a] leading-none"
										style={{ fontFamily: "var(--font-display)" }}
									>
										{step.index}
									</span>
									<h3 className="font-medium text-lg text-white tracking-[-0.02em]">
										{step.title}
									</h3>
									<p className="text-[#9a9a9a] text-[15px] leading-[1.55]">
										{step.body}
									</p>
								</CardContent>
							</Card>
						</li>
					))}
				</ol>
			</div>
		</section>
	);
}
