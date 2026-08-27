import { createDb } from "@doki/db";
import * as authSchema from "@doki/db/schema/auth";
import * as tenantSchema from "@doki/db/schema/tenant";
import { env } from "@doki/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";

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
