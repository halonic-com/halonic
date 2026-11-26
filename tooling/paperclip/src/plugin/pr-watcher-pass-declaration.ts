import type { PluginApiRouteDeclaration } from "@paperclipai/plugin-sdk";

/** The route key of the PR watcher's last pass. */
export const prWatcherPassRouteKey = "pr-watcher-pass";

/**
 * The last `pr-watch` pass's rule input and the watcher's actions, board
 * only, for the served `pr-watcher` workflow (HAL-19720,
 * src/plugin/pr-watcher-pass-route.ts).
 */
export const prWatcherPassRoute: PluginApiRouteDeclaration = {
  routeKey: prWatcherPassRouteKey,
  method: "GET",
  path: "/pr-watcher/pass",
  auth: "board",
  capability: "api.routes.register",
  companyResolution: { from: "query", key: "companyId" },
};
