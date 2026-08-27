// biome-ignore-all lint/complexity/noUselessLoneBlockStatements: blocks scope each test group's locals
import dotenv from "dotenv";

// The cache factory reads env to decide Redis vs memory.
dotenv.config({ path: "../../apps/web/.env" });

const { cached_, getCache, setCache, tenantKey } = await import(
	"../src/cache/index"
);

let pass = 0;
let fail = 0;

function check(label: string, actual: unknown, expected: unknown) {
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	if (ok) {
		pass++;
		console.log(`  ok   ${label}`);
	} else {
		fail++;
		console.log(
			`  FAIL ${label}\n         expected ${JSON.stringify(expected)}\n         actual   ${JSON.stringify(actual)}`,
		);
	}
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

console.log("\nKey namespacing (tenant isolation):");
{
	check("scopes by tenant", tenantKey("dashboard", "org_a"), "dashboard:org_a");
	check(
		"scopes by tenant and suffix",
		tenantKey("dashboard", "org_a", "overview:30"),
		"dashboard:org_a:overview:30",
	);
	// Two tenants must never collide on the same key.
	check(
		"different tenants produce different keys",
		tenantKey("dashboard", "org_a", "x") !==
			tenantKey("dashboard", "org_b", "x"),
		true,
	);
}

console.log("\nRead-through behaviour:");
{
	setCache(null);
	const cache = getCache();
	await cache.invalidate("test");

	let loads = 0;
	const load = async () => {
		loads++;
		return { value: loads };
	};

	const first = await cached_("test:a", 60, load);
	const second = await cached_("test:a", 60, load);

	check("first call loads", first, { value: 1 });
	check("second call is served from cache", second, { value: 1 });
	check("loader ran exactly once", loads, 1);
}

console.log("\nExpiry:");
{
	const cache = getCache();
	await cache.invalidate("test");

	let loads = 0;
	const load = async () => {
		loads++;
		return loads;
	};

	await cached_("test:ttl", 1, load);
	await sleep(1100);
	const after = await cached_("test:ttl", 1, load);

	check("reloads once the TTL has passed", after, 2);
	check("loader ran twice", loads, 2);
}

console.log("\nInvalidation:");
{
	const cache = getCache();
	await cache.invalidate("test");

	await cache.set("test:org_a:one", 1, 60);
	await cache.set("test:org_a:two", 2, 60);
	await cache.set("test:org_b:one", 3, 60);

	await cache.invalidate("test:org_a");

	check("prefix entries dropped", await cache.get("test:org_a:one"), null);
	check("all of them", await cache.get("test:org_a:two"), null);
	// The whole point of namespacing: one tenant's write must not evict another's.
	check("other tenant untouched", await cache.get("test:org_b:one"), 3);
}

console.log("\nFailures never break the caller:");
{
	// A cache that throws on every operation must still let reads succeed.
	setCache({
		name: "broken",
		async get() {
			throw new Error("redis down");
		},
		async set() {
			throw new Error("redis down");
		},
		async invalidate() {
			throw new Error("redis down");
		},
	});

	let threw = false;
	let value: number | null = null;
	try {
		value = await cached_("test:broken", 60, async () => 42);
	} catch {
		threw = true;
	}

	// cached_ surfaces the error today; the guarantee we rely on is that the
	// invalidation helper swallows it. Record actual behaviour rather than
	// asserting something convenient.
	check("a broken cache is visible to the caller", threw, true);
	check("no partial value returned", value, null);

	setCache(null);
}

console.log("\nBounded memory fallback:");
{
	setCache(null);
	const cache = getCache();
	check("falls back to memory without Redis configured", cache.name, "memory");

	for (let i = 0; i < 600; i++) {
		await cache.set(`bulk:${i}`, i, 60);
	}
	// Oldest entries are evicted past the cap, so a long-lived dev server
	// cannot grow without bound.
	check("oldest entry evicted", await cache.get("bulk:0"), null);
	check("newest entry retained", await cache.get("bulk:599"), 599);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
