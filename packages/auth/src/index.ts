import { createDb } from "@doki/db";
import * as authSchema from "@doki/db/schema/auth";
import * as tenantSchema from "@doki/db/schema/tenant";
import { env } from "@doki/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";
import { asc, eq } from "drizzle-orm";

/**
 * Roles inside a workspace. Public signup can never select these — a new user
 * becomes OWNER of their own new organization and nothing else.
 */
export const ROLES = {
	OWNER: "owner",
	ADMIN: "admin",
	MEMBER: "member",
} as const;

export function createAuth() {
	const db = createDb();

	/** The workspace a returning user should land in: their earliest membership. */
	async function resolveActiveOrganization(
		userId: string,
	): Promise<string | null> {
		const [membership] = await db
			.select({ organizationId: tenantSchema.member.organizationId })
			.from(tenantSchema.member)
			.where(eq(tenantSchema.member.userId, userId))
			.orderBy(asc(tenantSchema.member.createdAt))
			.limit(1);

		return membership?.organizationId ?? null;
	}

	return betterAuth({
		database: drizzleAdapter(db, {
			provider: "pg",
			schema: { ...authSchema, ...tenantSchema },
		}),
		trustedOrigins: [env.BETTER_AUTH_URL],
		emailAndPassword: {
			enabled: true,
			minPasswordLength: 10,
		},
		session: {
			expiresIn: 60 * 60 * 24 * 7,
			updateAge: 60 * 60 * 24,
			// Short cache so revocation takes effect quickly.
			cookieCache: { enabled: true, maxAge: 60 },
		},
		databaseHooks: {
			session: {
				create: {
					/**
					 * Sets the active workspace on every new session.
					 *
					 * Without this, `session.activeOrganizationId` starts null on each
					 * sign-in and every tenant-scoped page reads that as "this user has
					 * no workspace" — so a returning member is asked to create one they
					 * already belong to. The organization plugin only sets this when
					 * `setActive` is called explicitly, which never happens on login.
					 */
					before: async (session) => {
						const activeOrganizationId = await resolveActiveOrganization(
							session.userId,
						);
						return { data: { ...session, activeOrganizationId } };
					},
				},
			},
		},
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		plugins: [
			organization({
				allowUserToCreateOrganization: true,
				organizationLimit: 5,
				creatorRole: ROLES.OWNER,
				membershipLimit: 25,
			}),
			nextCookies(),
		],
	});
}

export const auth = createAuth();

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth["$Infer"]["Session"];
