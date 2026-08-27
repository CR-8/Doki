"use client";

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@doki/ui/components/accordion";
import { Button } from "@doki/ui/components/button";
import Link from "next/link";

const FAQS = [
	{
		q: "Do I have to replace my phone system?",
		a: "No. doki brings its own outbound numbers, or you point it at the Twilio or Vapi account you already pay for. Nothing changes for your inbound line.",
	},
	{
		q: "How does doki stay on the right side of the rules?",
		a: "Every dial is checked before it rings: the number against your suppression list, the lead against a stored consent record, and the clock against 09:00–21:00 in the lead's own timezone.",
	},
	{
		q: "What happens when a lead is actually interested?",
		a: "The outcome is confirmed on the call, the lead moves to qualified or meeting-booked, and a rep picks it up with the transcript attached — usually before they have opened the tab.",
	},
	{
		q: "Which languages can the agents speak?",
		a: "English plus the major Indian languages, using Indic speech models for recognition and voice. An agent can switch mid-call when the person answers in another language.",
	},
	{
		q: "Can I hear what the agent said?",
		a: "Yes. Every call is recorded and transcribed against the lead, so you can audit any conversation long after it ended.",
	},
];

export default function CtaFaq() {
	return (
		<section className="cta-faq" id="faq">
			<div className="mx-auto w-full max-w-[1100px] px-6 py-20 max-[900px]:py-[60px]">
				<div className="grid grid-cols-[1.6fr_1fr] items-stretch gap-[30px] max-[900px]:grid-cols-1 max-[900px]:gap-[60px]">
					<div
						className="c5-animated-gradient flex flex-col items-center justify-center rounded-[24px] px-10 py-20 text-center text-white"
						style={{ boxShadow: "0 10px 30px rgba(0, 0, 0, 0.05)" }}
					>
						<h2
							className="mb-[15px] font-normal text-[3.5rem] leading-[1.1] max-[560px]:text-[2.25rem]"
							style={{ letterSpacing: "-0.03em" }}
						>
							Ready to stop
							<br />
							dialling?
						</h2>
						<p className="mb-[30px] font-normal text-[0.9rem] opacity-85">
							Put your first agent on the phone this afternoon.
						</p>
						<Button
							className="h-auto bg-neutral-900 font-semibold text-[0.95rem] text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-neutral-900"
							nativeButton={false}
							render={<Link href="/login" />}
							style={{
								padding: "14px 32px",
								borderRadius: "12px",
								boxShadow: "0 10px 20px rgba(0,0,0,0.3)",
							}}
						>
							Get started today
						</Button>
					</div>

					<Accordion
						className="justify-center gap-3"
						defaultValue={[FAQS[0]?.q ?? ""]}
						multiple={false}
					>
						{FAQS.map((faq) => (
							<AccordionItem
								className="rounded-[10px] border border-white/10 not-last:border-b bg-white/[0.02] px-5 transition-colors duration-200 hover:border-white/20 data-open:border-white/20 data-open:bg-white/[0.04]"
								key={faq.q}
								value={faq.q}
							>
								<AccordionTrigger className="py-[18px] font-normal text-[0.9rem] text-white hover:no-underline **:data-[slot=accordion-trigger-icon]:text-white/60">
									{faq.q}
								</AccordionTrigger>
								<AccordionContent className="pb-[18px] text-[#9a9a9a] text-[0.9rem] leading-[1.6]">
									{faq.a}
								</AccordionContent>
							</AccordionItem>
						))}
					</Accordion>
				</div>
			</div>
		</section>
	);
}
