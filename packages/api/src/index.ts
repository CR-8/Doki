import { resolveWorkspace } from "@doki/auth/workspace";
import { ORPCError, os } from "@orpc/server";

import type { Context } from "./context";

export const o = os.$context<Context>();

export const publicProcedure = o;

const requireAuth = o.middleware(async ({ context, next }) => {
	if (!context.session?.user) {
		throw new ORPCError("UNAUTHORIZED");
	}
	return next({
		context: {
			session: context.session,
			user: context.session.user,
		},
	});
});

/**
 * Tenant scope. `organizationId` is derived from the server-side session and
 * NEVER accepted as an input parameter — that is the whole defence against
 * cross-tenant access. Every domain query takes it as a mandatory argument.
 */
const requireOrganization = o.middleware(async ({ context, next }) => {
	const session = context.session;
	const user = session?.user;
	if (!session || !user) {
		throw new ORPCError("UNAUTHORIZED");
	}

	// Resolves from the session, healing older sessions that predate the
	// hook which sets this at sign-in. Never taken from client input.
	const organizationId = await resolveWorkspace({
		userId: user.id,
		sessionId: session.session.id,
		activeOrganizationId: session.session.activeOrganizationId,
	});

	if (!organizationId) {
		throw new ORPCError("FORBIDDEN", {
			message: "No active workspace. Create or select a workspace first.",
		});
	}

	return next({
		context: {
			session,
			user,
			organizationId,
		},
	});
});

export const protectedProcedure = publicProcedure.use(requireAuth);
export const tenantProcedure = publicProcedure.use(requireOrganization);

export type { Context };
