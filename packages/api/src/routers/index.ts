import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { agentsRouter } from "./agents";
import { callsRouter } from "./calls";
import { complianceRouter } from "./compliance";
import { dashboardRouter } from "./dashboard";
import { followUpsRouter } from "./followups";
import { leadsRouter } from "./leads";
import { settingsRouter } from "./settings";
import { telephonyRouter } from "./telephony";

export const appRouter = {
	healthCheck: publicProcedure.handler(() => {
		return "OK";
	}),
	privateData: protectedProcedure.handler(({ context }) => {
		return {
			message: "This is private",
			user: context.session?.user,
		};
	}),
	leads: leadsRouter,
	agents: agentsRouter,
	calls: callsRouter,
	compliance: complianceRouter,
	dashboard: dashboardRouter,
	followUps: followUpsRouter,
	settings: settingsRouter,
	telephony: telephonyRouter,
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
