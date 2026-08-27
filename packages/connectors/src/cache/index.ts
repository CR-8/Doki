import { env } from "@doki/env/server";

export type CacheProvider = {
	readonly name: string;
	get<T>(key: string): Promise<T | null>;
	set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
	/** Accepts a prefix so a whole namespace can be dropped after a write. */
	invalidate(prefix: string): Promise<void>;
};

/**
 * Fallback used when no Redis is configured.
 *
 * Per-instance and therefore near-useless on serverless — deliberately so: it
 * keeps local development working without Redis, while making it obvious that
 * real caching needs configuration. Bounded so a long-lived dev server cannot
 * leak memory.
 */
class MemoryCache implements CacheProvider {
	readonly name = "memory";
	private readonly store = new Map<
		string,
		{ value: unknown; expiresAt: number }
	>();
	private readonly maxEntries = 500;

	async get<T>(key: string): Promise<T | null> {
		const hit = this.store.get(key);
		if (!hit) return null;
		if (hit.expiresAt <= Date.now()) {
			this.store.delete(key);
			return null;
		}
		return hit.value as T;
	}

	async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
		if (this.store.size >= this.maxEntries) {
			// Drop the oldest insertion; Map preserves insertion order.
			const oldest = this.store.keys().next().value;
			if (oldest) this.store.delete(oldest);
		}
		this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
	}

	async invalidate(prefix: string): Promise<void> {
		for (const key of this.store.keys()) {
			if (key.startsWith(prefix)) this.store.delete(key);
		}
	}
}

/**
 * Upstash Redis over its REST API.
 *
 * REST rather than a TCP client because serverless functions are short-lived
 * and cannot hold a connection pool open — a normal Redis client would open a
 * socket per invocation and exhaust the connection limit under mild load.
 */
class UpstashCache implements CacheProvider {
	readonly name = "upstash";

	constructor(
		private readonly url: string,
		private readonly token: string,
	) {}

	private async command<T>(args: (string | number)[]): Promise<T | null> {
		try {
			const res = await fetch(this.url, {
				method: "POST",
				headers: {
					authorization: `Bearer ${this.token}`,
					"content-type": "application/json",
				},
				body: JSON.stringify(args),
			});
			if (!res.ok) return null;
			const payload = (await res.json()) as { result?: T };
			return payload.result ?? null;
		} catch {
			// A cache is an optimisation. Never let it take down the request.
			return null;
		}
	}

	async get<T>(key: string): Promise<T | null> {
		const raw = await this.command<string>(["GET", key]);
		if (raw === null) return null;
		try {
			return JSON.parse(raw) as T;
		} catch {
			return null;
		}
	}

	async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
		await this.command(["SET", key, JSON.stringify(value), "EX", ttlSeconds]);
	}

	async invalidate(prefix: string): Promise<void> {
		// SCAN rather than KEYS: KEYS blocks the server, and this runs on a
		// user-facing write path.
		let cursor = "0";
		for (let i = 0; i < 20; i++) {
			const page = await this.command<[string, string[]]>([
				"SCAN",
				cursor,
				"MATCH",
				`${prefix}*`,
				"COUNT",
				200,
			]);
			if (!page) return;

			const [next, keys] = page;
			if (keys.length > 0) await this.command(["DEL", ...keys]);
			cursor = next;
			if (cursor === "0") return;
		}
	}
}

let cached: CacheProvider | null = null;

export function getCache(): CacheProvider {
	if (cached) return cached;

	if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
		cached = new UpstashCache(
			env.UPSTASH_REDIS_REST_URL,
			env.UPSTASH_REDIS_REST_TOKEN,
		);
	} else {
		cached = new MemoryCache();
	}
	return cached;
}

export function setCache(provider: CacheProvider | null): void {
	cached = provider;
}

/** Default time-to-live. Short enough that stale dashboards self-correct. */
export const DEFAULT_TTL_SECONDS = 300;

/**
 * Read-through cache helper.
 *
 * Keys are namespaced by tenant so `invalidate("dashboard:org_x")` can drop a
 * single workspace's entries without touching anyone else's — and so a cache
 * key can never leak data across tenants.
 */
export async function cached_<T>(
	key: string,
	ttlSeconds: number,
	load: () => Promise<T>,
): Promise<T> {
	const cache = getCache();

	const hit = await cache.get<T>(key);
	if (hit !== null) return hit;

	const value = await load();
	await cache.set(key, value, ttlSeconds);
	return value;
}

export function tenantKey(
	namespace: string,
	organizationId: string,
	suffix = "",
): string {
	return suffix
		? `${namespace}:${organizationId}:${suffix}`
		: `${namespace}:${organizationId}`;
}
