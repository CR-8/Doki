import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@doki/ui/components/avatar";
import { Card, CardContent, CardHeader } from "@doki/ui/components/card";
import { cn } from "@doki/ui/lib/utils";

import { LANDING_CARD } from "./card-surface";

type Person = {
	name: string;
	role: string;
	initials: string;
	photo: string;
};

const PEOPLE = {
	priya: {
		name: "Priya Menon",
		role: "VP Sales, Northwind Realty",
		initials: "PM",
		photo:
			"https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=160&h=160&fit=crop&crop=faces&q=80",
	},
	daniel: {
		name: "Daniel Okafor",
		role: "Head of Revenue Ops, Latch",
		initials: "DO",
		photo:
			"https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=160&h=160&fit=crop&crop=faces&q=80",
	},
	meera: {
		name: "Meera Iyer",
		role: "Growth Lead, Fenwick",
		initials: "MI",
		photo:
			"https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=160&h=160&fit=crop&crop=faces&q=80",
	},
	tomas: {
		name: "Tomás Ribeiro",
		role: "Sales Manager, Corvia",
		initials: "TR",
		photo:
			"https://images.unsplash.com/photo-1519345182560-3f2917c472ef?w=160&h=160&fit=crop&crop=faces&q=80",
	},
} satisfies Record<string, Person>;

function Attribution({ person }: { person: Person }) {
	return (
		<div className="grid grid-cols-[auto_1fr] items-center gap-3">
			<Avatar className="size-12 after:border-white/15 after:mix-blend-normal">
				<AvatarImage alt={person.name} src={person.photo} />
				<AvatarFallback className="bg-white/10 text-white">
					{person.initials}
				</AvatarFallback>
			</Avatar>
			<div>
				<cite className="font-medium text-[14px] text-white not-italic">
					{person.name}
				</cite>
				<span className="block text-[#9a9a9a] text-[13px]">{person.role}</span>
			</div>
		</div>
	);
}

export default function Testimonials() {
	return (
		<section className="testimonials" id="testimonials">
			<div className="mx-auto max-w-6xl space-y-8 px-6 py-20 md:space-y-16 md:py-28">
				<div className="relative z-10 mx-auto max-w-xl space-y-4 text-center md:space-y-6">
					<h2 className="font-medium text-4xl text-white leading-[1.12] tracking-[-0.045em] lg:text-5xl">
						Built for teams that live on the phone.
					</h2>
					<p className="text-[#9a9a9a] text-[15.5px] leading-[1.55] tracking-[-0.015em]">
						doki makes the first attempt on every lead, so reps only pick up the
						conversations that are already warm.
					</p>
				</div>

				<div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4 lg:grid-rows-2">
					<Card
						className={cn(
							LANDING_CARD,
							"grid grid-rows-[auto_1fr] gap-8 sm:col-span-2 sm:p-6 lg:row-span-2",
						)}
					>
						<CardHeader>
							<span className="inline-flex items-center gap-2 text-[13px] text-white/70 uppercase tracking-[0.14em]">
								<svg
									aria-hidden="true"
									className="size-4 text-white"
									fill="none"
									viewBox="0 0 16 16"
									xmlns="http://www.w3.org/2000/svg"
								>
									<circle cx="8" cy="8" fill="currentColor" r="3.2" />
									<circle
										cx="8"
										cy="8"
										r="6.6"
										stroke="currentColor"
										strokeOpacity="0.45"
									/>
								</svg>
								Northwind Realty
							</span>
						</CardHeader>
						<CardContent>
							<blockquote className="grid h-full grid-rows-[1fr_auto] gap-6">
								<p className="font-medium text-white text-xl leading-[1.45] tracking-[-0.02em]">
									We were burning two SDRs on a list that never got shorter.
									doki now takes the first attempt on every new lead inside the
									calling window, retires the ones that opt out, and books the
									rest into a rep&apos;s calendar. Connect-to-meeting is up 3x
									and nobody on the team has touched a dialler in four months.
								</p>
								<Attribution person={PEOPLE.priya} />
							</blockquote>
						</CardContent>
					</Card>

					<Card className={cn(LANDING_CARD, "md:col-span-2")}>
						<CardContent className="h-full pt-6">
							<blockquote className="grid h-full grid-rows-[1fr_auto] gap-6">
								<p className="font-medium text-white text-xl leading-[1.45] tracking-[-0.02em]">
									The compliance story is what sold it internally. Every dial
									carries a consent record and the suppression check runs before
									the number ever rings — legal signed off in a week.
								</p>
								<Attribution person={PEOPLE.daniel} />
							</blockquote>
						</CardContent>
					</Card>

					<Card className={cn(LANDING_CARD)}>
						<CardContent className="h-full pt-6">
							<blockquote className="grid h-full grid-rows-[1fr_auto] gap-6">
								<p className="text-[15px] text-white leading-[1.55]">
									We pointed doki at 14,000 stale leads over a weekend. It came
									back with 400 that were still interested.
								</p>
								<Attribution person={PEOPLE.meera} />
							</blockquote>
						</CardContent>
					</Card>

					<Card className={cn(LANDING_CARD)}>
						<CardContent className="h-full pt-6">
							<blockquote className="grid h-full grid-rows-[1fr_auto] gap-6">
								<p className="text-[15px] text-white leading-[1.55]">
									Recording, transcript, and outcome are on the lead before the
									rep even opens the tab. Handover finally feels instant.
								</p>
								<Attribution person={PEOPLE.tomas} />
							</blockquote>
						</CardContent>
					</Card>
				</div>
			</div>
		</section>
	);
}
