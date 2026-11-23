import { definePlugin, type PluginContext, runWorker } from "@paperclipai/plugin-sdk";
import { boardCheck } from "./board-check.ts";
import { registerBoardTools } from "./board-tools.ts";
import { handleGhGuard } from "./gh-guard-route.ts";
import { runWatcher } from "./job.ts";
import { registerReadyForReview } from "./ready-for-review.ts";
import { taskEffort } from "./task-effort.ts";
import { type TaskTagger, taskTagger } from "./task-tagger.ts";
import { registerTools } from "./tools.ts";

/**
 * The Agent tools plugin's worker. The host starts it as `dist/worker.js`
 * (bundled by `pnpm run build:plugin`), runs the `pr-watch` and
 * `board-check` jobs on their schedules, looks at each new comment for a
 * board ask, keeps each failed run, tags a created or changed task's
 * difficulty, sets its effort from its tags, reports the tagger's monthly
 * spend as its health on the plugin page, and answers the agent tools and the `gh` wrapper's route.
 */
let context: PluginContext | undefined;
let tagger: TaskTagger | undefined;

export const plugin = definePlugin({
  async setup(ctx) {
    context = ctx;
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
    ctx.events.on("agent.run.failed", async (event) => {
      await board.onRunFailed(event, new Date());
    });
    const effort = taskEffort(ctx, { fetch: (url, init) => fetch(url, init) });
    ctx.events.on("issue.created", (event) => effort.onIssueEvent(event));
    ctx.events.on("issue.updated", (event) => effort.onIssueEvent(event));
    const tags = taskTagger(ctx, { fetch: (url, init) => fetch(url, init), now: () => new Date() });
    tagger = tags;
    ctx.events.on("issue.created", (event) => tags.onIssueEvent(event));
    ctx.events.on("issue.updated", (event) => tags.onIssueEvent(event));
    registerTools(ctx);
    registerReadyForReview(ctx);
    registerBoardTools(ctx);
  },
  async onHealth() {
    if (tagger === undefined) {
      return { status: "degraded", message: "The Agent tools plugin is still starting." };
    }
    return await tagger.health();
  },
  async onApiRequest(input) {
    if (context === undefined) {
      return { status: 503, body: { error: "The Agent tools plugin is still starting." } };
    }
    if (input.routeKey !== "gh-guard") {
      return { status: 404, body: { error: "No such Agent tools route." } };
    }
    return await handleGhGuard(input, context);
  },
});

// biome-ignore lint/style/noDefaultExport: the plugin host reads the plugin from the default export.
export default plugin;

runWorker(plugin, import.meta.url);
