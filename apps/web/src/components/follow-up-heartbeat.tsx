"use client";

import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { orpc } from "@/utils/orpc";

/** How often an open console offers to drain. The server enforces its own floor. */
const INTERVAL_MS = 3 * 60 * 1000;

/**
 * Drives the follow-up runner from the browser.
 *
 * This deployment has no background worker — serverless functions only exist
 * while handling a request, and the Hobby cron tier fires once a day, which is
 * useless for follow-ups measured in minutes. So the console itself becomes
 * the trigger: while someone has it open, due follow-ups get drained.
 *
 * Safe by construction rather than by luck:
 *   - the server applies a system-wide interval, so N tabs cause one drain
 *   - the runner claims rows with FOR UPDATE SKIP LOCKED, so even a drain that
 *     slips through concurrently cannot double-dial a lead
 *   - it pauses while the tab is hidden, so background tabs cost nothing
 *
 * Renders nothing. Failures are deliberately silent: this is opportunistic
 * background work, and a toast every three minutes would be worse than the
 * missed drain.
 */
export function FollowUpHeartbeat() {
	const drain = useMutation(orpc.followUps.drain.mutationOptions({}));
	// Kept in a ref so the effect below never re-subscribes on re-render.
	const drainRef = useRef(drain.mutate);
	drainRef.current = drain.mutate;

	useEffect(() => {
		let cancelled = false;

		const tick = () => {
			if (cancelled) return;
			if (typeof document !== "undefined" && document.hidden) return;
			drainRef.current({ force: false });
		};

		// One attempt shortly after load, so opening the console picks up
		// anything that fell due while nobody was watching.
		const initial = setTimeout(tick, 4000);
		const interval = setInterval(tick, INTERVAL_MS);

		// Coming back to the tab is the moment most likely to have a backlog.
		const onVisible = () => {
			if (!document.hidden) tick();
		};
		document.addEventListener("visibilitychange", onVisible);

		return () => {
			cancelled = true;
			clearTimeout(initial);
			clearInterval(interval);
			document.removeEventListener("visibilitychange", onVisible);
		};
	}, []);

	return null;
}
