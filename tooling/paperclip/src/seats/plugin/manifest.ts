import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

/**
 * The `seats` plugin (HAL-16008): reads each AI seat's limits, keeps the
 * history the seat forecast needs and proposes moves. Its own plugin, apart
 * from Agent tools, so the board installs, stops and trusts it on its own.
 *
 * This is the skeleton: settings, its own database schema and the board-only
 * routes. The `seats.read` job and the page come in later pull requests.
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
    // Board-only routes: every route below says `auth: "board"`, and src/seats/plugin/routes.ts checks it again.
    "api.routes.register",
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
    },
  },
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
      routeKey: "seats.manual-reset",
      method: "POST",
      path: "/seats/:seatId/manual-reset",
      auth: "board",
      capability: "api.routes.register",
      companyResolution: { from: "query", key: "companyId" },
    },
  ],
};

// biome-ignore lint/style/noDefaultExport: the plugin host reads the manifest from the default export.
export default manifest;
