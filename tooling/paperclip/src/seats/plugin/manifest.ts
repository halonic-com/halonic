import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

/**
 * The `seats` plugin (HAL-16008): reads each AI seat's limits, keeps the
 * history the seat forecast needs and proposes moves. Its own plugin, apart
 * from Agent tools, so the board installs, stops and trusts it on its own.
 *
 * So far: settings, its own database schema, the board-only routes, the
 * `seats.read`, `seats.history` and `seats.check` jobs and the read-only
 * `seat_usage` tool. The page's data comes from the board-only `seats.page`
 * route; the page itself comes in a later pull request.
 */
export const manifest: PaperclipPluginManifestV1 = {
  id: "halonic.seats",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "AI seats",
  description:
    "Reads each AI seat's usage limits, keeps their history for the seat forecast, and proposes moving agents between seats. It never moves an agent unless the board turns that on.",
  author: "Halonic",
  categories: ["automation"],
  capabilities: [
    "database.namespace.migrate",
    "database.namespace.read",
    "database.namespace.write",
    "jobs.schedule",
    // Board-only routes: every route below says `auth: "board"`, and src/seats/plugin/routes.ts checks it again.
    "api.routes.register",
    // seat_usage: read-only, answers only the agents the board lists in seatUsageAgents.
    "agent.tools.register",
    // seats.check: posts its proposals on the one task the board sets in proposalTaskId,
    // and keeps the last one it posted so it posts only when the proposal changes.
    "issue.comments.create",
    "plugin.state.read",
    "plugin.state.write",
  ],
  entrypoints: { worker: "worker.js" },
  database: {
    namespaceSlug: "seats",
    migrationsDir: "migrations",
    // agents: seat placements; cost_events: tokens per run; heartbeat_runs and issues: what an agent has on.
    coreReadTables: ["agents", "cost_events", "heartbeat_runs", "issues"],
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      seats: {
        type: "array",
        title: "Seats",
        description:
          "The AI seats, in reading order. Adding a seat at the end moves no other seat's read time.",
        default: [],
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
              title: "Seat id",
              description:
                "A short key for the seat, as it appears in the history and on the page.",
              pattern: "^[a-z0-9][a-z0-9-]*$",
            },
            role: {
              type: "string",
              title: "Role",
              description: "Only pool seats take agents. A paid API seat never does.",
              enum: ["pool", "reserve", "paid-api"],
            },
            configDir: {
              type: "string",
              title: "Claude folder",
              description: "The seat's Claude Code configuration folder on the server.",
            },
            account: {
              type: "string",
              title: "Expected account",
              description:
                "The e-mail address the seat should be signed in with. It is only compared, never stored or shown.",
            },
            connectionId: {
              type: "string",
              title: "Paperclip connection",
              description:
                "The id of the seat's Claude connection in Paperclip. Agents that use it count as placed on this seat. It is only compared, never stored or shown.",
            },
            resetGroup: {
              type: "string",
              title: "Manual reset group",
              description: "Seats that share one manual reset have the same group.",
            },
          },
          required: ["id", "role", "configDir"],
        },
      },
      movesEnabled: {
        type: "boolean",
        title: "Move agents",
        description:
          "Off: the plugin only proposes moves on a task and the board applies them. On: it may move agents itself, within the plan's limits (HAL-16010).",
        default: false,
      },
      proposalTaskId: {
        type: "string",
        title: "Task for proposed moves",
        description:
          "The id of the task seats.check posts its proposed moves on, only when they change. Empty: it proposes nothing.",
      },
      seatUsageAgents: {
        type: "array",
        title: "Agents that may call seat_usage",
        description:
          "The Paperclip ids of the agents that may read the stored seat readings with the seat_usage tool. Empty: no agent may.",
        default: [],
        items: { type: "string" },
      },
    },
  },
  jobs: [
    {
      jobKey: "seats.read",
      displayName: "Read seats",
      description:
        "Every minute: reads each seat that is due, at its own minute in every 10 minutes, and stores its usage limits. Backs off after a rate limit.",
      schedule: "* * * * *",
    },
    {
      jobKey: "seats.history",
      displayName: "Record seat history",
      description:
        "Every 10 minutes: records which seat each agent is on, its tokens per 10 minutes and what it has on, from Paperclip's own tables.",
      schedule: "*/10 * * * *",
    },
    {
      jobKey: "seats.check",
      displayName: "Propose seat moves",
      description:
        "Every 10 minutes: works out which agents should move to another seat and which full seat is worth its manual reset, and posts that on the board's task when it changes. It moves no one.",
      schedule: "5-59/10 * * * *",
    },
  ],
  apiRoutes: [
    {
      routeKey: "seats.list",
      method: "GET",
      path: "/seats",
      auth: "board",
      capability: "api.routes.register",
      companyResolution: { from: "query", key: "companyId" },
    },
    {
      routeKey: "seats.page",
      method: "GET",
      path: "/seats/page",
      auth: "board",
      capability: "api.routes.register",
      companyResolution: { from: "query", key: "companyId" },
    },
    {
      routeKey: "seats.manual-reset",
      method: "POST",
      path: "/seats/:seatId/manual-reset",
      auth: "board",
      capability: "api.routes.register",
      companyResolution: { from: "query", key: "companyId" },
    },
  ],
  tools: [
    {
      name: "seat_usage",
      displayName: "Seat usage",
      description:
        "Each AI seat's label, how its newest read went (ok, rate-limited, signed-out and so on), its newest stored usage windows with how old they are, and its alerts. Read-only: it answers from what seats.read stored and never reads a seat itself. Only the agents the board lists may call it.",
      parametersSchema: { type: "object", properties: {} },
    },
  ],
};

// biome-ignore lint/style/noDefaultExport: the plugin host reads the manifest from the default export.
export default manifest;
