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
import { fetchHonouringSignal } from "./fetch-signal.ts";
import { frontBot } from "./front-bot.ts";
import { serial } from "./front-bot-budget.ts";
import { gitHubPrStatus } from "./front-bot-lookup.ts";
import { chatNotesRouteKey, handleChatNotes } from "./front-bot-notes.ts";
import { progressNotes } from "./front-bot-progress.ts";
import { pendingMessages, registerRunChoice } from "./front-bot-run-choice.ts";
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
import { gitHubPrints, type MergerNudge, mergerWake } from "./merger-wake.ts";
import { registerNextStepTools } from "./next-step-tools.ts";
import { readyStep, registerPrWriteTools } from "./pr-write-tools.ts";
import { precheckWaits } from "./precheck-waits.ts";
import { realDeps, registerReadyForReview } from "./ready-for-review.ts";
import { scheduledPerCompany } from "./scheduled.ts";
import { seatMovePass } from "./seat-move-job.ts";
import { registerStatePacket } from "./state-packet-data.ts";
import { taskEffort } from "./task-effort.ts";
import { registerTaskTools } from "./task-tools.ts";
import { thinSpecCheck } from "./thin-spec-check.ts";
import { registerTools } from "./tools.ts";
import { registerTrialResults } from "./trial-results.ts";
import { measureWakeGate } from "./wake-gate-data.ts";
import { registerWakeHold } from "./wake-hold.ts";
import {
  handleWorkerAgentsRequest,
  registerWorkerAgentsData,
  workerAgentsDeps,
} from "./worker-agents-route.ts";

/**
 * The Agent tools plugin's worker. The host starts it as `dist/worker.js`
 * (bundled by `pnpm run build:plugin`), runs the `pr-watch`,
 * `board-check`, `merge-control`, `merger-wake`, `precheck-wake` and `seat-move` jobs on their schedules, looks at each new comment for a
 * board ask, keeps each failed run, labels a created or changed task's
 * difficulty, sets its effort from its tags, assigns a channel's child task
 * back after 3 hand-offs, asks for acceptance criteria on a
 * new code task whose text looks thin, and answers the agent tools, the `gh` wrapper's route,
 * the board's Worker agents page and the board's GitHub summary routes, and
 * builds the state packet the server asks for before a monitor wake's run, and
 * answers the front bot's run choice before a chat message's run and
 * whether to hold a chat message's wake.
 */
let context: PluginContext | undefined;
/** The companies the jobs dispatch to, learnt from scoped calls (see companies.ts). */
const roster = companyRoster();
/** Starts a merge control pass for an approval or a green `ci-ok` (HAL-18729); set in `setup`. */
let nudgeMergeControl: PassNudge | undefined;
/** Asks the Merger wake for a pass for a webhook delivery (HAL-19234); set in `setup`. */
let nudgeMerger: MergerNudge | undefined;

export const plugin = definePlugin({
  async setup(ctx) {
    context = ctx;
    // Each job only dispatches; its pass runs in a call scoped to the company (scheduled.ts).
    const lifecycle = lifecycleRunner(ctx);
    // Its reviewer run reads go to Paperclip's own API with Node's fetch, like the task effort handler's.
    const watcher = scheduledPerCompany(ctx, roster, "pr-watch", (companyId, now) =>
      runWatcher(
        ctx,
        now,
        async () => [companyId],
        lifecycle,
        (url, init) => fetch(url, init),
      ),
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
    // Off unless the board turns it on: the pass then returns before reading anything.
    const mergerJob = scheduledPerCompany(ctx, roster, "merger-wake", (companyId, now) =>
      merger.pass(companyId, now),
    );
    const merger = mergerWake(ctx, {
      readPrints: gitHubPrints(ctx),
      request: (companyId) => mergerJob.request(companyId),
    });
    ctx.jobs.register("merger-wake", () => mergerJob.dispatch());
    nudgeMerger = merger.nudge;
    // ready_for_review remembers a running check; the job wakes its task once it is done.
    const waits = precheckWaits(ctx, realDeps, (companyId) => roster.remember(companyId));
    const precheckJob = scheduledPerCompany(ctx, roster, "precheck-wake", (companyId) =>
      waits.pass(companyId),
    );
    ctx.jobs.register("precheck-wake", () => precheckJob.dispatch());
    // Does nothing until the board sets `readingsPlugin`; reads and moves through Paperclip's own API (HAL-19354).
    const seatJob = scheduledPerCompany(ctx, roster, "seat-move", (companyId, now) =>
      seatMovePass(ctx, (url, init) => fetch(url, init), companyId, now),
    );
    ctx.jobs.register("seat-move", () => seatJob.dispatch());
    // Off unless the board turns it on; its only outside call is to api.anthropic.com (HAL-19136).
    const botDeps = {
      anthropicFetch: (url: string | URL | Request, init?: RequestInit) => fetch(url, init),
      now: () => new Date(),
    };
    // The lookups, off unless turned on as well, read GitHub with GET only (HAL-19222).
    const lookupDeps = { now: botDeps.now, readPrStatus: gitHubPrStatus(ctx) };
    // First replies and progress notes count the same day's spend, one call at a time.
    const botQueue = serial();
    // The run-choice data key (HAL-19219) waits briefly for a message the bot is still on.
    const botPending = pendingMessages();
    const bot = frontBot(ctx, { ...botDeps, ...lookupDeps }, botQueue, botPending);
    registerRunChoice(ctx, botPending);
    registerWakeHold(ctx);
    // Off unless the board turns them on too; reads only Paperclip's own API for the run (HAL-19218).
    const notes = progressNotes(
      ctx,
      {
        ...botDeps,
        paperclipFetch: (url, init) => fetch(url, init),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      },
      botQueue,
    );
    ctx.events.on("issue.comment.created", async (event) => {
      roster.remember(event.companyId);
      // Not awaited: the bot's queue never holds up the other comment handlers.
      void bot.onCommentCreated(event);
      void notes.onCommentCreated(event);
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
      anthropicFetch: fetchHonouringSignal((url, init) => ctx.http.fetch(url, init)),
      paperclipFetch: (url, init) => fetch(url, init),
      now: () => new Date(),
    });
    const thinSpec = thinSpecCheck(ctx, {
      anthropicFetch: fetchHonouringSignal((url, init) => ctx.http.fetch(url, init)),
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
    registerReadyForReview(ctx, waits);
    registerBoardTools(ctx);
    registerTaskTools(ctx);
    registerNextStepTools(ctx, undefined, readyStep(ctx));
    registerPrWriteTools(ctx);
    registerTrialResults(ctx);
    registerStatePacket(ctx, (params) => measureWakeGate(ctx, params));
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
      return await handleChiefLineRequest(input, context, new Date(), {
        mergeControl: nudgeMergeControl,
        merger: nudgeMerger,
      });
    }
    if (input.routeKey === githubSummaryRouteKey) {
      return await handleGitHubSummary(input, context);
    }
    if (input.routeKey === chatNotesRouteKey) {
      return await handleChatNotes(input, context);
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
