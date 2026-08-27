import Link from "next/link";

import NewsletterForm from "./newsletter-form";

const NAVIGATION = [
	{ label: "How it works", href: "#how-it-works" },
	{ label: "Features", href: "#features" },
	{ label: "Customers", href: "#testimonials" },
	{ label: "FAQ", href: "#faq" },
];

const PAGES: { label: string; href: "/" | "/login" | "/dashboard" }[] = [
	{ label: "Home", href: "/" },
	{ label: "Sign in", href: "/login" },
	{ label: "Dashboard", href: "/dashboard" },
];

const LINK =
	"text-[0.85rem] text-[#9a9a9a] no-underline transition-colors duration-200 hover:text-white";

export default function SiteFooter() {
	return (
		<footer className="site-footer border-white/10 border-t pt-20 pb-5 max-[900px]:pt-[60px]">
			<div className="mx-auto w-full max-w-[1100px] px-6">
				<div className="mb-[50px] grid grid-cols-[2fr_1fr_1fr_2fr] gap-10 max-[480px]:grid-cols-1 max-[900px]:grid-cols-2">
					<div>
						<Link
							aria-label="doki.ai"
							className="mb-[15px] inline-flex items-center gap-[9px] font-semibold text-[15.5px] text-white tracking-[-0.03em]"
							href="/"
						>
							<svg
								aria-hidden="true"
								className="size-6"
								fill="currentColor"
								viewBox="0 0 24 24"
							>
								<g transform="rotate(-30 12 12)">
									<circle cx="7.3" cy="3.2" r="1.45" />
									<rect height="14.6" rx="1.8" width="3.6" x="5.5" y="4.7" />
									<rect height="14.6" rx="1.8" width="3.6" x="14.9" y="4.7" />
									<circle cx="16.7" cy="20.8" r="1.45" />
								</g>
							</svg>
							<span>
								doki<span className="font-normal">.ai</span>
							</span>
						</Link>
						<p className="max-w-[220px] text-[#9a9a9a] text-[0.85rem] leading-[1.6]">
							Voice agents that make the first call, so your reps only take the
							warm ones.
						</p>
					</div>

					<nav aria-label="Sections">
						<h2 className="mb-5 font-semibold text-[0.95rem] text-white">
							Navigation
						</h2>
						<ul>
							{NAVIGATION.map((item) => (
								<li className="mb-3" key={item.href}>
									<a className={LINK} href={item.href}>
										{item.label}
									</a>
								</li>
							))}
						</ul>
					</nav>

					<nav aria-label="Pages">
						<h2 className="mb-5 font-semibold text-[0.95rem] text-white">
							Pages
						</h2>
						<ul>
							{PAGES.map((item) => (
								<li className="mb-3" key={item.href}>
									<Link className={LINK} href={item.href}>
										{item.label}
									</Link>
								</li>
							))}
						</ul>
					</nav>

					<div>
						<h2 className="mb-5 font-semibold text-[0.95rem] text-white">
							Newsletter
						</h2>
						<p className="mb-[15px] text-[#9a9a9a] text-[0.85rem]">
							One note a month on what the agents learned.
						</p>
						<NewsletterForm />
					</div>
				</div>

				<div className="flex justify-between border-white/10 border-t pt-[25px] pb-[10px] text-[#9a9a9a] text-[0.85rem] max-[480px]:flex-col max-[480px]:items-center max-[480px]:gap-[15px]">
					<span>All rights reserved. © 2026 doki</span>
					<span>Built for teams that live on the phone.</span>
				</div>
			</div>
		</footer>
	);
}
