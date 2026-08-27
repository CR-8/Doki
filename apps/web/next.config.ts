import "@doki/env/web";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	typedRoutes: true,
	reactCompiler: true,

	// Tunnels used while testing carrier webhooks against a local dev server.
	allowedDevOrigins: [
		"b5f6-2401-4900-1c3d-663a-693c-bb61-59fa-1621.ngrok-free.app",
	],

	// Workspace packages ship raw TypeScript, so Next must compile them.
	transpilePackages: [
		"@doki/api",
		"@doki/auth",
		"@doki/connectors",
		"@doki/db",
		"@doki/domain",
		"@doki/env",
		"@doki/ui",
	],
};

export default nextConfig;
