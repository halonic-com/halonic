import { parseRunId } from "./run-routes.ts";

/** Who may call a route: anyone, a signed webhook sender, or a caller with a session. */
export type RouteAccess = "public" | "webhook" | "signed-in";

/**
 * What a route does with runs, so a test can check each kind against the rules for runs without
 * keeping its own list of routes.
 */
export type RouteKind = "run-read" | "run-write" | "run-start" | "run-list" | "other";

/** The values a route's path pattern reads from the request path. */
export interface RouteParams {
  /** The `:runId` segment, checked with the same rule as every run id. */
  readonly runId?: string;
}

/**
 * One declared route. The path is a pattern: literal segments, plus `:runId`, which matches one
 * well-formed run id and nothing else.
 */
export interface RouteEntry<Handler> {
  readonly method: string;
  readonly path: string;
  readonly access: RouteAccess;
  readonly kind: RouteKind;
  readonly handler: Handler;
}

/** A route as a test sees it: everything but the handler. */
export type RouteDescription = Omit<RouteEntry<unknown>, "handler">;

/** The route a request matched, with the values its path pattern read. */
export interface RouteMatch<Route> {
  readonly route: Route;
  readonly params: RouteParams;
}

const runIdParam = ":runId";

/** Reads `pathname` against one pattern; `null` when a segment differs or the run id is malformed. */
function matchPath(pattern: string, pathname: string): RouteParams | null {
  const expected = pattern.split("/");
  const actual = pathname.split("/");
  if (expected.length !== actual.length) {
    return null;
  }
  let runId: string | undefined;
  for (const [index, segment] of expected.entries()) {
    const given = actual[index] ?? "";
    if (segment !== runIdParam) {
      if (segment !== given) return null;
      continue;
    }
    const parsed = parseRunId(given);
    if (parsed === null) return null;
    runId = parsed;
  }
  return runId === undefined ? {} : { runId };
}

/**
 * Finds the route for a request in a declared table. The server answers only through this, so a
 * route can't exist without an entry, and an address no entry matches answers 404 before any
 * session is checked.
 *
 * @returns the first entry whose method and path match, or `null`
 */
export function matchRoute<Route extends RouteEntry<unknown>>(
  table: readonly Route[],
  method: string,
  pathname: string,
): RouteMatch<Route> | null {
  for (const route of table) {
    if (route.method !== method) continue;
    const params = matchPath(route.path, pathname);
    if (params !== null) {
      return { route, params };
    }
  }
  return null;
}

/** The table without its handlers, for tests that walk every route of a kind or access. */
export function describeRoutes(table: readonly RouteEntry<unknown>[]): RouteDescription[] {
  return table.map(({ method, path, access, kind }) => ({ method, path, access, kind }));
}
