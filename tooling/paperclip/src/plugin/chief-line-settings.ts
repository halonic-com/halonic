/**
 * The chief line's settings and names: one `chiefLine` object in the plugin's
 * instance settings, read by src/plugin/chief-line.ts and
 * src/plugin/chief-line-signal.ts. Only the board edits instance settings.
 */

/** A caller's name: lower case letters, digits and dashes, at most 41 characters. */
export const callerPattern = /^[a-z0-9][a-z0-9-]{0,40}$/;

/** The route keys the manifest declares and the worker answers. */
export const chiefLineRouteKeys = {
  send: "chief-line-send",
  openThread: "chief-line-open-thread",
  thread: "chief-line-thread",
  subscribe: "chief-line-subscribe",
} as const;

/** The chief line's settings, spread into the manifest's instance settings. */
export const chiefLineConfigProperties = {
  chiefLine: {
    type: "object",
    title: "Chief line",
    description:
      "A caller (the board's supervisor, later Halonic Studio) talks to Chief on its own task and gets a signal when Chief replies.",
    properties: {
      enabled: {
        type: "boolean",
        title: "On",
        description: "Off: the chief line's routes refuse every call and no signal is sent.",
        default: false,
      },
      projectId: {
        type: "string",
        title: "Project",
        description:
          "The id of the project the chief line's tasks ([chief-line] <caller>) are created in. Empty: threads are not created.",
      },
      webhookHosts: {
        type: "array",
        title: "Webhook hosts",
        description:
          "Host names a caller's reply signal may be sent to. Empty: no webhook is accepted.",
        items: { type: "string" },
        default: [],
      },
      maxPerHour: {
        type: "integer",
        title: "Wakes per hour per caller",
        description: "Chief is woken at most this many times per caller in the last hour.",
        minimum: 1,
        default: 20,
      },
    },
  },
} as const;

/** The chief line's settings as the plugin uses them. */
export interface ChiefLineSettings {
  readonly enabled: boolean;
  readonly projectId: string | undefined;
  readonly webhookHosts: readonly string[];
  readonly maxPerHour: number;
}

/** Reads the `chiefLine` object of a company's settings, with the defaults for what's missing. */
export function readChiefLineSettings(
  config: Record<string, unknown> | undefined,
): ChiefLineSettings {
  const raw = (config?.["chiefLine"] ?? {}) as Record<string, unknown>;
  const projectId = raw["projectId"];
  const hosts = raw["webhookHosts"];
  const max = raw["maxPerHour"];
  return {
    enabled: raw["enabled"] === true,
    projectId:
      typeof projectId === "string" && projectId.trim() !== "" ? projectId.trim() : undefined,
    webhookHosts: Array.isArray(hosts)
      ? hosts.filter((host): host is string => typeof host === "string").map((h) => h.toLowerCase())
      : [],
    maxPerHour: typeof max === "number" && Number.isInteger(max) && max > 0 ? max : 20,
  };
}

/** Whether `url` is an http(s) address whose host is in the allow-list. */
export function webhookAllowed(url: string, hosts: readonly string[]): boolean {
  try {
    const parsed = new URL(url);
    return (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      parsed.username === "" &&
      parsed.password === "" &&
      hosts.includes(parsed.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

/** The title of a caller's task. */
export const threadTitle = (caller: string) => `[chief-line] ${caller}`;

/** A thread's title, with the caller as its first group. */
export const threadTitlePattern = /^\[chief-line\] ([a-z0-9][a-z0-9-]{0,40})$/;

/** Where the chief line keeps its records: one entry per company. */
export const chiefLineStateKey = (companyId: string, key: ChiefLineRecord) =>
  ({ scopeKind: "company", scopeId: companyId, namespace: "chief-line", stateKey: key }) as const;

/** The chief line's records in plugin state: threads, wakes per hour, the plugin's own posts, webhooks, signalled comments. */
export type ChiefLineRecord = "threads" | "wakes" | "posted" | "hooks" | "signalled";

/** The chief line's routes, board only (src/plugin/chief-line.ts). */
export const chiefLineRoutes = (
  [
    [chiefLineRouteKeys.openThread, "POST", "/chief-line/thread"],
    [chiefLineRouteKeys.thread, "GET", "/chief-line/thread"],
    [chiefLineRouteKeys.send, "POST", "/chief-line/send"],
    [chiefLineRouteKeys.subscribe, "POST", "/chief-line/subscribe"],
  ] as const
).map(([routeKey, method, path]) => ({
  routeKey,
  method,
  path,
  auth: "board" as const,
  capability: "api.routes.register" as const,
  companyResolution: { from: "query" as const, key: "companyId" },
}));

/** What the manifest takes from the chief line: its settings and routes. */
export const chiefLine = {
  properties: chiefLineConfigProperties,
  routes: chiefLineRoutes,
};
