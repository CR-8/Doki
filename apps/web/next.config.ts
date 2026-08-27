import "@doki/env/web";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	typedRoutes: true,
	reactCompiler: true,
};
module.exports = {
	allowedDevOrigins: [
		"b5f6-2401-4900-1c3d-663a-693c-bb61-59fa-1621.ngrok-free.app",
	],
};

export default nextConfig;
