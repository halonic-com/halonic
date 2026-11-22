import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import { boardCheck } from "./board-check.ts";
import { runWatcher } from "./job.ts";
import { registerTools } from "./tools.ts";

/**
 * The Agent tools plugin's worker. The host starts it as `dist/worker.js`
 * (bundled by `pnpm run build:plugin`), runs the `pr-watch` and
 * `board-check` jobs on their schedules, looks at each new comment for a
 * board ask, and answers the `pr_status`, `my_prs` and `queue_state` tools.
 */
export const plugin = definePlugin({
  async setup(ctx) {
    ctx.jobs.register("pr-watch", async () => {
      await runWatcher(ctx, new Date());
    });
    const board = boardCheck(ctx);
    ctx.jobs.register("board-check", async () => {
      await board.run(new Date());
    });
    ctx.events.on("issue.comment.created", async (event) => {
      await board.onCommentCreated(event, new Date());
    });
    registerTools(ctx);
  },
});

// biome-ignore lint/style/noDefaultExport: the plugin host reads the plugin from the default export.
export default plugin;

runWorker(plugin, import.meta.url);
