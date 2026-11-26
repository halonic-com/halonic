import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { shippedDefinitions } from "@halonicjs/action-catalog";
import { routesOf, type StepperDefinition } from "@halonicjs/action-steppers";
import type { ActionRoute } from "@halonicjs/ports";

/** The route list the desktop shell compiles in, relative to the repo root. Git ignores it. */
export const actionRoutesFile = "apps/studio/src-tauri/src/generated/action-routes.json";

/** The format `halonic-action-send` reads (`routes.rs`). */
const routeListFormat = "halonic.action-routes/1";

/**
 * The services the shell sends to and signs in with (`action-send`'s
 * `services.rs`). The shell refuses the whole list for one route it can't
 * read, so a definition of any other service stays out of it until the shell
 * knows that service: its steps keep their manual guide.
 */
export const shellServices: readonly string[] = ["github"];

/** A host a guided step opens, as the shell's list names it. */
interface WebOrigin {
  service: string;
  host: string;
  pathPrefixes: string[];
}

/** The whole list, as `halonic-action-send` reads it. */
export interface ActionRouteList {
  format: typeof routeListFormat;
  webOrigins: WebOrigin[];
  routes: ActionRoute[];
}

/**
 * The host of each guided route, once per service. No path prefixes: those
 * are for on-demand `browser` blocks, which the shipped catalog doesn't offer
 * yet, so a host on the list opens only its guided steps' own pages.
 */
function webOriginsOf(routes: readonly ActionRoute[]): WebOrigin[] {
  const origins = new Map<string, WebOrigin>();
  for (const route of routes) {
    if (route.kind !== "guided") continue;
    const host = new URL(route.address).host;
    origins.set(`${route.service} ${host}`, { service: route.service, host, pathPrefixes: [] });
  }
  return [...origins.values()];
}

/**
 * The shell's route list for these definitions (architecture note on
 * HAL-17491, 2.4): every route `routesOf` builds for a definition of a
 * service the shell knows, and the hosts its guided steps open.
 */
export function actionRouteList(definitions: readonly StepperDefinition[]): ActionRouteList {
  const routes = definitions
    .filter((definition) => shellServices.includes(definition.service))
    .flatMap((definition) => routesOf(definition));
  return { format: routeListFormat, webOrigins: webOriginsOf(routes), routes };
}

/**
 * Writes the shipped catalog's route list where the shell's `build.rs` reads
 * it, unless it is already up to date. Plain `pnpm discover` calls it, like
 * the other git-ignored files, so a build never compiles a stale list.
 *
 * @returns whether the file changed
 */
export function writeActionRoutes(root: string): boolean {
  const list = actionRouteList(shippedDefinitions.map((entry) => entry.definition));
  const text = `${JSON.stringify(list, null, 2)}\n`;
  const path = join(root, actionRoutesFile);
  if (existsSync(path) && readFileSync(path, "utf8") === text) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return true;
}
