import { auth } from "@doki/auth";
import { db } from "@doki/db";
import type { NextRequest } from "next/server";

/**
 * Request context. Deliberately does NOT carry raw `Headers` — keeping web
 * types out of the inferred context keeps this package portable (and lets
 * declaration emit work across the monorepo).
 */
export async function createContext(req: NextRequest) {
	const session = await auth.api.getSession({
		headers: req.headers,
	});

	return {
		db,
		session,
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
