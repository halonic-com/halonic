import { definePlugin, type PluginContext, runWorker } from "@paperclipai/plugin-sdk";
import { handleSeatsRequest } from "./routes.ts";
import { readSeatsSettings } from "./settings.ts";
import { databaseStore } from "./store.ts";

// The SDK hands route calls no context, so the worker keeps the one `setup` got.
let context: PluginContext | undefined;

/**
 * The `seats` plugin's worker. The host starts it as `worker.js` in the
 * folder `pnpm run build:seats-plugin` writes (`dist/seats/`), after it has
 * run the plugin's migrations, and hands it the board-only route calls.
 */
export const plugin = definePlugin({
  async setup(ctx) {
    context = ctx;
  },
  async onApiRequest(input) {
    const ctx = context;
    if (ctx === undefined) {
      return { status: 503, body: { error: "The AI seats plugin is still starting." } };
    }
    return await handleSeatsRequest(input, {
      readSettings: async (companyId) => readSeatsSettings(await ctx.config.get(companyId)),
      store: databaseStore(ctx.db),
      now: () => new Date(),
    });
  },
});

// biome-ignore lint/style/noDefaultExport: the plugin host reads the plugin from the default export.
export default plugin;

runWorker(plugin, import.meta.url);
