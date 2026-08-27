import { getCache, tenantKey } from "@doki/connectors/cache/index";

/**
 * Drops a workspace's cached aggregates.
 *
 * Called after anything that changes what the dashboard reports. Without this
 * a user would place a call and see stale numbers for up to the full TTL,
 * which reads as the product being broken rather than merely cached.
 *
 * Never throws: a cache that cannot be cleared must not fail the write that
 * already succeeded. The TTL is the backstop.
 */
export async function invalidateDashboard(
	organizationId: string,
): Promise<void> {
	try {
		await getCache().invalidate(tenantKey("dashboard", organizationId));
	} catch (error) {
		console.warn("[cache] dashboard invalidation failed", {
			organizationId,
			error,
		});
	}
}
