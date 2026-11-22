import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import { runWatcher } from "./job.ts";
import { registerTools } from "./tools.ts";

/**
 * The Agent tools plugin's worker. The host starts it as `dist/worker.js`
 * (bundled by `pnpm run build:plugin`), runs the `pr-watch` job on its
 * schedule and answers the `pr_status`, `my_prs` and `queue_state` tools.
 */
export const plugin = definePlugin({
  async setup(ctx) {
    ctx.jobs.register("pr-watch", async () => {
      await runWatcher(ctx, new Date());
    });
    registerTools(ctx);
  },
});

// biome-ignore lint/style/noDefaultExport: the plugin host reads the plugin from the default export.
export default plugin;

runWorker(plugin, import.meta.url);
