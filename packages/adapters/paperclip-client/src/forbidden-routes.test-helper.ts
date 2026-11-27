// The Paperclip routes the fixed request list must never reach (`security.test.ts`).

/** One forbidden route: a pattern over a row's path, and a sample path a row could have. */
export interface ForbiddenRoute {
  name: string;
  /** Only these methods, when set; any method otherwise. */
  methods?: readonly string[];
  path: RegExp;
  sample: string;
}

/**
 * Paperclip's routes that reach secrets, an agent's configuration or rights, or keys (HAL-17491,
 * 6.8 condition 2). A row of the fixed list matching one fails the test, whatever its `:name`
 * segments are called. `methods` limits a pattern to those methods.
 */
export const forbiddenRoutes: readonly ForbiddenRoute[] = [
  { name: "secrets", path: /\/secrets(\/|$)/, sample: "/api/companies/:company/secrets" },
  {
    name: "secret provider configs",
    path: /\/secret-provider-configs(\/|$)/,
    sample: "/api/companies/:company/secret-provider-configs",
  },
  { name: "a person's secrets", path: /\/user-secrets(\/|$)/, sample: "/api/user-secrets/:key" },
  {
    name: "an agent's configuration",
    methods: ["POST", "PATCH", "PUT", "DELETE"],
    path: /^\/api\/agents\/[^/]+$/,
    sample: "/api/agents/:agent",
  },
  { name: "permissions", path: /\/permissions(\/|$)/, sample: "/api/agents/:agent/permissions" },
  {
    name: "an agent's instructions",
    path: /\/instructions-bundle(\/|$)/,
    sample: "/api/agents/:agent/instructions-bundle",
  },
  {
    name: "an agent's approval",
    path: /^\/api\/agents\/[^/]+\/approve$/,
    sample: "/api/agents/:agent/approve",
  },
  {
    name: "an agent's keys",
    path: /^\/api\/agents\/[^/]+\/keys(\/|$)/,
    sample: "/api/agents/:id/keys",
  },
  {
    name: "an agent's configuration rollback",
    path: /\/config-revisions\/[^/]+\/rollback$/,
    sample: "/api/agents/:agent/config-revisions/:revision/rollback",
  },
  {
    name: "where an agent's instructions come from",
    path: /\/instructions-path$/,
    sample: "/api/agents/:agent/instructions-path",
  },
  {
    name: "a new agent",
    methods: ["POST", "PUT"],
    path: /^\/api\/companies\/[^/]+\/agents$/,
    sample: "/api/companies/:company/agents",
  },
  { name: "a hire", path: /\/agent-hires(\/|$)/, sample: "/api/companies/:company/agent-hires" },
  {
    name: "an agent's sign-in",
    path: /\/claude-login$/,
    sample: "/api/agents/:agent/claude-login",
  },
  {
    name: "adopting a connection for an agent",
    path: /\/connection-intents\/[^/]+\/adopt$/,
    sample: "/api/agents/:agent/connection-intents/:interaction/adopt",
  },
  { name: "board keys", path: /\/board-api-keys(\/|$)/, sample: "/api/board-api-keys/:key" },
  {
    name: "sign-in challenges",
    path: /\/cli-auth\/challenges(\/|$)/,
    sample: "/api/cli-auth/challenges",
  },
  {
    name: "setup-token sessions",
    path: /setup-token/,
    sample: "/api/companies/:company/setup-token-login-sessions/:session/completion",
  },
];

/** Each row of `rows` that matches a forbidden route, as `<row>: <route>`. */
export function forbiddenRows(
  rows: Readonly<Record<string, { method: string; path: string }>>,
): string[] {
  return Object.entries(rows).flatMap(([row, { method, path }]) =>
    forbiddenRoutes
      .filter((route) => (route.methods ?? [method]).includes(method) && route.path.test(path))
      .map((route) => `${row}: ${route.name}`),
  );
}
