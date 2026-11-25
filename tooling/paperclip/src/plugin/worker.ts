import { definePlugin, type PluginContext, runWorker } from "@paperclipai/plugin-sdk";
import { fittedModel } from "../thin-spec/model.ts";
import { workerAgentsRouteKey } from "../worker-agents/keys.ts";
import { databaseWorkerTables } from "../worker-agents/tables.ts";
import { boardCheck } from "./board-check.ts";
import { registerBoardTools } from "./board-tools.ts";
import { handleChiefLineRequest, isChiefLineRoute } from "./chief-line.ts";
import { onChiefLineComment } from "./chief-line-signal.ts";
import { companyRoster } from "./companies.ts";
import { difficultyTagger } from "./difficulty-tagger.ts";
import { lifecycleRunner } from "./fast-track-lifecycle-job.ts";
import { handleGhGuard } from "./gh-guard-route.ts";
import {
  githubPullRouteKey,
  githubSummaryRouteKey,
  handleGitHubPull,
  handleGitHubSummary,
} from "./github-routes.ts";
import { handoffLimit } from "./handoff-limit.ts";
import { runWatcher } from "./job.ts";
import { mergeControlPass } from "./merge-control-job.ts";
import { passLock } from "./merge-control-lock.ts";
import { mergeFactsReader } from "./merge-control-reader.ts";
import { type PassNudge, passTrigger } from "./merge-control-trigger.ts";
import { registerNextStepTools } from "./next-step-tools.ts";
import { registerReadyForReview } from "./ready-for-review.ts";
import { scheduledPerCompany } from "./scheduled.ts";
import { registerStatePacket } from "./state-packet-data.ts";
import { taskEffort } from "./task-effort.ts";
import { registerTaskTools } from "./task-tools.ts";
import { thinSpecCheck } from "./thin-spec-check.ts";
import { registerTools } from "./tools.ts";
import { registerTrialResults } from "./trial-results.ts";
import {
  handleWorkerAgentsRequest,
  registerWorkerAgentsData,
  workerAgentsDeps,
} from "./worker-agents-route.ts";

/**
 * The Agent tools plugin's worker. The host starts it as `dist/worker.js`
 * (bundled by `pnpm run build:plugin`), runs the `pr-watch`,
 * `board-check` and `merge-control` jobs on their schedules, looks at each new comment for a
 * board ask, keeps each failed run, labels a created or changed task's
 * difficulty, sets its effort from its tags, assigns a channel's child task
 * back after 3 hand-offs, asks for acceptance criteria on a
 * new code task whose text looks thin, and answers the agent tools, the `gh` wrapper's route,
 * the board's Worker agents page and the board's GitHub summary routes, and
 * builds the state packet the server asks for before a monitor wake's run.
 */
let context: PluginContext | undefined;
/** The companies the jobs dispatch to, learnt from scoped calls (see companies.ts). */
const roster = companyRoster();
/** Starts a merge control pass for an approval or a green `ci-ok` (HAL-18729); set in `setup`. */
let nudgeMergeControl: PassNudge | undefined;

export const plugin = definePlugin({
  async setup(ctx) {
    context = ctx;
    // Each job only dispatches; its pass runs in a call scoped to the company (scheduled.ts).
    const lifecycle = lifecycleRunner(ctx);
    const watcher = scheduledPerCompany(ctx, roster, "pr-watch", (companyId, now) =>
      runWatcher(ctx, now, async () => [companyId], lifecycle),
    );
    ctx.jobs.register("pr-watch", () => watcher.dispatch());
    const board = boardCheck(ctx);
    const boardJob = scheduledPerCompany(ctx, roster, "board-check", (companyId, now) =>
      board.run(now, async () => [companyId]),
    );
    ctx.jobs.register("board-check", () => boardJob.dispatch());
    // Off unless the board sets a mode: the pass then returns before reading anything.
    const readFacts = mergeFactsReader(ctx, (url, init) => fetch(url, init));
    // The worker's one pass lock: merge control's state is written only through it.
    const lock = passLock(ctx.state);
    const mergeJob = scheduledPerCompany(ctx, roster, "merge-control", (companyId, now) =>
      mergeControlPass(ctx, lock, companyId, now, readFacts).then(() => undefined),
    );
    ctx.jobs.register("merge-control", () => mergeJob.dispatch());
    nudgeMergeControl = passTrigger(
      (companyId) => mergeJob.request(companyId),
      (companyId, error) =>
        ctx.logger.error(`merge-control: couldn't start a pass: ${error.message}`, { companyId }),
    );
    ctx.events.on("issue.comment.created", async (event) => {
      roster.remember(event.companyId);
      await Promise.all([
        board.onCommentCreated(event, new Date()),
        onChiefLineComment(ctx, event),
      ]);
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
    const thinSpec = thinSpecCheck(ctx, {
      anthropicFetch: (url, init) => ctx.http.fetch(String(url), init),
      paperclipFetch: (url, init) => fetch(url, init),
      now: () => new Date(),
      model: fittedModel,
    });
    const handoffs = handoffLimit(ctx);
    for (const eventType of ["issue.created", "issue.updated"] as const) {
      ctx.events.on(eventType, async (event) => {
        roster.remember(event.companyId);
        await Promise.all([
          tagger.onIssueEvent(event),
          effort.onIssueEvent(event),
          thinSpec.onIssueEvent(event),
          handoffs.onIssueEvent(event),
        ]);
      });
    }
    registerTools(ctx);
    registerReadyForReview(ctx);
    registerBoardTools(ctx);
    registerTaskTools(ctx);
    registerNextStepTools(ctx);
    registerTrialResults(ctx);
    registerStatePacket(ctx);
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
    if (isChiefLineRoute(input.routeKey)) {
      return await handleChiefLineRequest(input, context, new Date(), nudgeMergeControl);
    }
    if (input.routeKey === githubSummaryRouteKey) {
      return await handleGitHubSummary(input, context);
    }
    if (input.routeKey === githubPullRouteKey) {
      return await handleGitHubPull(input, context);
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
