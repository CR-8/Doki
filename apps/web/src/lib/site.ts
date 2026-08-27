import { env } from "@doki/env/server";

/** Public origin for absolute marketing URLs (robots, sitemap, metadata). */
export const SITE_URL = env.APP_URL.replace(/\/$/, "");

/** Routes behind auth. Never worth crawling, and never in the sitemap. */
export const PRIVATE_ROUTES = [
	"/api/",
	"/agents",
	"/calls",
	"/dashboard",
	"/follow-ups",
	"/leads",
	"/settings",
];
