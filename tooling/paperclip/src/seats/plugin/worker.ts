import { definePlugin, type PluginContext, runWorker } from "@paperclipai/plugin-sdk";
import { runCommand } from "../read/command.ts";
import { readSeat } from "../read/read-seat.ts";
import { runSeatsCheck } from "./check-job.ts";
import { runSeatsHistory } from "./history-job.ts";
import { databaseHistoryStore } from "./history-store.ts";
import { databaseTables } from "./paperclip-tables.ts";
import { runSeatsRead } from "./read-job.ts";
import { handleSeatsRequest } from "./routes.ts";
import { registerSeatUsageTool } from "./seat-usage-tool.ts";
import { SeatsReader } from "./seats-reader.ts";
import { readSeatsSettings } from "./settings.ts";
import { databaseStore } from "./store.ts";
import { databaseRecentReadings, databaseStoredReadings } from "./stored-readings.ts";

// The SDK hands route calls no context, so the worker keeps the one `setup` got.
let context: { readonly ctx: PluginContext; readonly reader: SeatsReader } | undefined;

/**
 * The only variables `claude` gets besides the seat's folder: it needs to
 * find itself and a home. Any API key in the worker's environment stays out.
 */
export function commandEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const name of ["PATH", "HOME"]) {
    const value = env[name];
    if (value !== undefined && value !== "") {
      kept[name] = value;
    }
  }
  return kept;
}

/**
 * The `seats` plugin's worker. The host starts it as `worker.js` in the
 * folder `pnpm run build:seats-plugin` writes (`dist/seats/`), after it has
 * run the plugin's migrations. It runs `seats.read` every minute,
 * `seats.history` and `seats.check` every 10 minutes, and answers the
 * board-only route calls and the `seat_usage` tool.
 */
export const plugin = definePlugin({
  async setup(ctx) {
    const store = databaseStore(ctx.db);
    const now = () => new Date();
    const env = commandEnv(process.env);
    const reader = new SeatsReader({
      read: (seat) => readSeat(seat, { run: runCommand, now: () => now().toISOString(), env }),
      store,
      now,
    });
    context = { ctx, reader };
    ctx.jobs.register("seats.read", async () => {
      await runSeatsRead(ctx, reader);
    });
    ctx.jobs.register("seats.history", async () => {
      await runSeatsHistory(ctx, {
        tables: databaseTables(ctx.db),
        store: databaseHistoryStore(ctx.db),
        now,
      });
    });
    ctx.jobs.register("seats.check", async () => {
      await runSeatsCheck(ctx, {
        tables: databaseTables(ctx.db),
        readings: databaseRecentReadings(ctx.db),
        store,
        now,
      });
    });
    registerSeatUsageTool(ctx, {
      stored: databaseStoredReadings(ctx.db),
      statuses: (seats) => reader.status(seats),
      now,
    });
  },
  async onApiRequest(input) {
    if (context === undefined) {
      return { status: 503, body: { error: "The AI seats plugin is still starting." } };
    }
    const { ctx, reader } = context;
    return await handleSeatsRequest(input, {
      readSettings: async (companyId) => readSeatsSettings(await ctx.config.get(companyId)),
      store: databaseStore(ctx.db),
      now: () => new Date(),
      reads: (seats) => ({ readerStartedAt: reader.startedAt, seats: reader.status(seats) }),
    });
  },
});

// biome-ignore lint/style/noDefaultExport: the plugin host reads the plugin from the default export.
export default plugin;

runWorker(plugin, import.meta.url);
