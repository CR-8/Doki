import { createDb } from "@doki/db";
import { session as sessionTable } from "@doki/db/schema/auth";
import { member } from "@doki/db/schema/tenant";
import { asc, eq } from "drizzle-orm";

/**
 * Resolves the workspace a request belongs to, repairing the session if needed.
 *
 * New sessions get `activeOrganizationId` from an auth hook, but sessions
 * created before that hook existed still carry null — and a null reads to every
 * page guard as "this user has no workspace", which is why a returning member
 * was being asked to create one they already belong to.
 *
 * Rather than force everyone to sign out, this heals the row in place the first
 * time such a session is used.
 */
export async function resolveWorkspace(input: {
	userId: string;
	sessionId: string;
	activeOrganizationId?: string | null;
}): Promise<string | null> {
	if (input.activeOrganizationId) return input.activeOrganizationId;

	const db = createDb();

	const [membership] = await db
		.select({ organizationId: member.organizationId })
		.from(member)
		.where(eq(member.userId, input.userId))
		.orderBy(asc(member.createdAt))
		.limit(1);

	if (!membership) return null;

	await db
		.update(sessionTable)
		.set({ activeOrganizationId: membership.organizationId })
		.where(eq(sessionTable.id, input.sessionId));

	return membership.organizationId;
}
