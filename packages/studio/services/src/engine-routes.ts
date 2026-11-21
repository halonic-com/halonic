/**
 * The engine's routes a page may call through the shell, by the names of the
 * shell's table (`ROUTES` in `apps/studio/src-tauri/src/engine_routes.rs`).
 * A `{param}` stands for one path segment the shell checks and builds itself;
 * a query param is listed apart.
 */
const engineRoutes = [
  { name: "GET /api/hello", answer: "json" },
  { name: "POST /api/runs", answer: "json" },
  { name: "POST /api/agent-runs", answer: "json" },
  { name: "GET /api/waiting-runs", answer: "json" },
  { name: "GET /api/runs/{run}", answer: "json" },
  { name: "POST /api/runs/{run}/events", answer: "json" },
  { name: "POST /api/runs/{run}/cancel", answer: "json" },
  { name: "GET /api/runs/{run}/events", answer: "stream", query: ["after"] },
  { name: "GET /api/run-updates", answer: "stream" },
  { name: "GET /api/routines", answer: "json" },
  { name: "POST /api/routines/{hub}/{routine}/run", answer: "json" },
] as const satisfies readonly EngineRouteEntry[];

interface EngineRouteEntry {
  readonly name: string;
  /** `json` for a route that answers once, `stream` for one that answers with server-sent events. */
  readonly answer: "json" | "stream";
  /** The query params the route takes, each a whole number. */
  readonly query?: readonly string[];
}

/** The names of the engine's routes that answer once, with JSON. */
export const engineJsonRoutes: readonly string[] = namesAnswering("json");

/** The names of the engine's routes that answer with server-sent events. */
export const engineStreamRoutes: readonly string[] = namesAnswering("stream");

/** A request the page made, as the shell takes it: a route of the table and the route's params. */
export interface EngineRouteCall {
  readonly route: string;
  readonly answer: "json" | "stream";
  readonly params: Readonly<Record<string, string | number>>;
}

/**
 * The route of the table `method` and `url` call, with the params their path and query hold;
 * `undefined` when no route of the table matches. Path params are decoded, so the shell gets
 * the run id itself and encodes it again; a query param goes as a number when it is one.
 */
export function engineRouteOf(method: string, url: URL): EngineRouteCall | undefined {
  for (const route of engineRoutes) {
    const [routeMethod, path] = route.name.split(" ", 2);
    if (routeMethod !== method) continue;
    const match = pathPattern(String(path)).exec(url.pathname);
    const query = "query" in route ? route.query : [];
    if (match === null || !sameKeys(query, [...url.searchParams.keys()])) continue;
    const params: Record<string, string | number> = {};
    for (const [name, value] of Object.entries(match.groups ?? {})) {
      params[name] = decodeURIComponent(value);
    }
    for (const [name, value] of url.searchParams) params[name] = numberOrText(value);
    return { route: route.name, answer: route.answer, params };
  }
  return undefined;
}

/** A path of the table as a pattern: each `{param}` is one segment that isn't empty, caught by its name. */
function pathPattern(path: string): RegExp {
  return new RegExp(`^${path.replace(/\{(\w+)\}/g, "(?<$1>[^/]+)")}$`);
}

function sameKeys(expected: readonly string[], actual: readonly string[]): boolean {
  return expected.length === actual.length && expected.every((key) => actual.includes(key));
}

/** A whole number as a number, so the shell's check takes it; anything else stays text, which the shell refuses. */
function numberOrText(value: string): string | number {
  return /^\d+$/.test(value) ? Number(value) : value;
}

function namesAnswering(answer: "json" | "stream"): readonly string[] {
  return engineRoutes.filter((route) => route.answer === answer).map((route) => route.name);
}
