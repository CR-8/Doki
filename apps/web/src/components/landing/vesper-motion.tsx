"use client";

import { useEffect } from "react";

const DESKTOP_QUERY = "(min-width: 901px)";

/**
 * Entrance-animation bookkeeping and the mobile menu for the landing page.
 *
 * Every `.appear` element rests at opacity 1, so the page is readable even if
 * animations never run. Once an element's own animation ends we pin it with
 * `.is-in`; if animations are not running at all (unsupported, blocked, or
 * already finished before hydration) we pin everything after two frames.
 */
export default function VesperMotion() {
	useEffect(() => {
		const targets: HTMLElement[] = Array.from(
			document.querySelectorAll<HTMLElement>(".appear"),
		);
		const photo = document.querySelector<HTMLElement>(".hero-photo");
		if (photo) {
			targets.push(photo);
		}

		const pin = (el: HTMLElement) => el.classList.add("is-in");
		for (const el of targets) {
			el.addEventListener("animationend", () => pin(el), { once: true });
		}

		let secondFrame = 0;
		const firstFrame = requestAnimationFrame(() => {
			secondFrame = requestAnimationFrame(() => {
				const animating = targets.some(
					(el) =>
						typeof el.getAnimations === "function" &&
						el
							.getAnimations()
							.some(
								(a) => a.playState === "running" || a.playState === "finished",
							),
				);
				if (!animating) {
					for (const el of targets) {
						pin(el);
					}
				}
			});
		});

		const body = document.body;
		const burger = document.querySelector<HTMLButtonElement>(".burger");
		const nav = document.getElementById("site-nav");
		const backdrop = document.querySelector<HTMLElement>(".menu-backdrop");

		const setMenu = (open: boolean) => {
			body.classList.toggle("menu-open", open);
			burger?.setAttribute("aria-expanded", String(open));
			burger?.setAttribute("aria-label", open ? "Close menu" : "Open menu");
		};
		const closeMenu = () => setMenu(false);
		const toggleMenu = () => setMenu(!body.classList.contains("menu-open"));

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				closeMenu();
			}
		};
		const onNavClick = (event: Event) => {
			if ((event.target as HTMLElement | null)?.closest("a")) {
				closeMenu();
			}
		};
		const desktop = window.matchMedia(DESKTOP_QUERY);
		const onDesktopChange = (event: MediaQueryListEvent) => {
			if (event.matches) {
				closeMenu();
			}
		};

		burger?.addEventListener("click", toggleMenu);
		nav?.addEventListener("click", onNavClick);
		backdrop?.addEventListener("click", closeMenu);
		document.addEventListener("keydown", onKeyDown);
		desktop.addEventListener("change", onDesktopChange);

		return () => {
			cancelAnimationFrame(firstFrame);
			cancelAnimationFrame(secondFrame);
			burger?.removeEventListener("click", toggleMenu);
			nav?.removeEventListener("click", onNavClick);
			backdrop?.removeEventListener("click", closeMenu);
			document.removeEventListener("keydown", onKeyDown);
			desktop.removeEventListener("change", onDesktopChange);
			body.classList.remove("menu-open");
		};
	}, []);

	return null;
}
