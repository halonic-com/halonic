import { definePlugin, type PluginContext, runWorker } from "@paperclipai/plugin-sdk";
import { workerAgentsRouteKey } from "../worker-agents/keys.ts";
import { databaseWorkerTables } from "../worker-agents/tables.ts";
import { boardCheck } from "./board-check.ts";
import { registerBoardTools } from "./board-tools.ts";
import { companyRoster } from "./companies.ts";
import { difficultyTagger } from "./difficulty-tagger.ts";
import { handleGhGuard } from "./gh-guard-route.ts";
import { runWatcher } from "./job.ts";
import { registerReadyForReview } from "./ready-for-review.ts";
import { scheduledPerCompany } from "./scheduled.ts";
import { taskEffort } from "./task-effort.ts";
import { registerTaskTools } from "./task-tools.ts";
import { registerTools } from "./tools.ts";
import {
  handleWorkerAgentsRequest,
  registerWorkerAgentsData,
  workerAgentsDeps,
} from "./worker-agents-route.ts";

/**
 * The Agent tools plugin's worker. The host starts it as `dist/worker.js`
 * (bundled by `pnpm run build:plugin`), runs the `pr-watch` and
 * `board-check` jobs on their schedules, looks at each new comment for a
 * board ask, keeps each failed run, labels a created or changed task's
 * difficulty, sets its effort from its tags, and answers the agent tools, the `gh` wrapper's route
 * and the board's Worker agents page.
 */
let context: PluginContext | undefined;
/** The companies the jobs dispatch to, learnt from scoped calls (see companies.ts). */
const roster = companyRoster();

export const plugin = definePlugin({
  async setup(ctx) {
    context = ctx;
    // Each job only dispatches; its pass runs in a call scoped to the company (scheduled.ts).
    const watcher = scheduledPerCompany(ctx, roster, "pr-watch", (companyId, now) =>
      runWatcher(ctx, now, async () => [companyId]),
    );
    ctx.jobs.register("pr-watch", () => watcher.dispatch());
    const board = boardCheck(ctx);
    const boardJob = scheduledPerCompany(ctx, roster, "board-check", (companyId, now) =>
      board.run(now, async () => [companyId]),
    );
    ctx.jobs.register("board-check", () => boardJob.dispatch());
    ctx.events.on("issue.comment.created", async (event) => {
      roster.remember(event.companyId);
      await board.onCommentCreated(event, new Date());
    });
    ctx.events.on("agent.run.failed", async (event) => {
      roster.remember(event.companyId);
      await board.onRunFailed(event, new Date());
    });
    const effort = taskEffort(ctx, { fetch: (url, init) => fetch(url, init) });
    const tagger = difficultyTagger(ctx, {
      anthropicFetch: (url, init) => ctx.http.fetch(String(url), init),
      paperclipFetch: (url, init) => fetch(url, init),
      now: () => new Date(),
    });
    for (const eventType of ["issue.created", "issue.updated"] as const) {
      ctx.events.on(eventType, async (event) => {
        roster.remember(event.companyId);
        await Promise.all([tagger.onIssueEvent(event), effort.onIssueEvent(event)]);
      });
    }
    registerTools(ctx);
    registerReadyForReview(ctx);
    registerBoardTools(ctx);
    registerTaskTools(ctx);
    registerWorkerAgentsData(ctx, workerAgentsDeps(ctx, databaseWorkerTables(ctx.db)));
  },
  async onApiRequest(input) {
    if (context === undefined) {
      return { status: 503, body: { error: "The Agent tools plugin is still starting." } };
    }
    if (input.routeKey === workerAgentsRouteKey) {
      return await handleWorkerAgentsRequest(
        input,
        workerAgentsDeps(context, databaseWorkerTables(context.db)),
      );
    }
    if (input.routeKey !== "gh-guard") {
      return { status: 404, body: { error: "No such Agent tools route." } };
    }
    roster.remember(input.companyId);
    return await handleGhGuard(input, context);
  },
});

// biome-ignore lint/style/noDefaultExport: the plugin host reads the plugin from the default export.
export default plugin;

runWorker(plugin, import.meta.url);
