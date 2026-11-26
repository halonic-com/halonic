import type { PluginEvent } from "@paperclipai/plugin-sdk";
import { callCostMicroUsd } from "../front-bot/limits.ts";
import {
  type FrontBotLogRecord,
  type FrontBotOutcome,
  type FrontBotReason,
  logMeta,
  notCalledRecord,
} from "../front-bot/log-record.ts";
import { checkProgressNote } from "../front-bot/progress-check.ts";
import { type ProgressInput, progressRequest } from "../front-bot/progress-prompt.ts";
import {
  completeLines,
  emptyStepLog,
  type LogCursor,
  newSteps,
  noteTaken,
  readSteps,
  type StepLog,
  startCursor,
} from "../front-bot/safe-steps.ts";
import {
  type ActiveNotesSettings,
  progressNotesOn,
  readFrontBotSettings,
} from "../front-bot/settings.ts";
import { errorCode } from "./board-check-api.ts";
import type { FrontBotApi } from "./front-bot.ts";
import { countSpend, readBudget, recordCall, type Serial } from "./front-bot-budget.ts";
import { askFrontBot, type FrontBotDeps } from "./front-bot-calls.ts";
import { rememberProgressNote } from "./front-bot-notes.ts";
import { type PaperclipFetch, readableRunId, readLogPiece, runIsLive } from "./front-bot-runs.ts";
import { agentAnswered, inputBlock, type Scene, sceneOf } from "./front-bot-scene.ts";
import { companyConfig } from "./job.ts";
import { writeMetrics } from "./metrics.ts";

/**
 * Progress notes mid-run (HAL-19218, step 2 of the design on HAL-18847, the
 * notes design on HAL-18743 section 5). When a board user writes on a chat
 * task, one watcher per chat follows the agent's run: every 15 s it reads the
 * run's status and the new part of its log, turns it into safe steps, and at
 * most every 45 s (the first after 30 s), when there are new steps, asks Haiku
 * for one short note. A note that fails the plain-code check is never kept.
 * Notes are never comments: they go to plugin state and the board-only
 * chat-notes route, so they wake nobody and no other handler hears them.
 */

/** What the watcher reaches outside the host, so tests replace it with recordings and a fake clock. */
export interface ProgressDeps extends FrontBotDeps {
  readonly paperclipFetch: PaperclipFetch;
  /** Waits `ms`; tests move their clock instead. */
  readonly sleep: (ms: number) => Promise<void>;
}

/** The watcher's timing and limits (HAL-18745 section 2). */
export const progressTiming = {
  pollMs: 15_000,
  firstNoteAfterMs: 30_000,
  noteGapMs: 45_000,
  maxNotesPerRun: 5,
  /** No run within this long after the message: no notes. */
  runWaitMs: 120_000,
  /** A watcher never outlives this, whatever the run does. */
  maxWatchMs: 30 * 60_000,
} as const;

/** One watch: the chat, its run, the settings and where the reading stands. */
interface Watch {
  readonly scene: Scene;
  readonly settings: ActiveNotesSettings;
  readonly runId: string;
  readonly agentName: string;
  readonly startedAt: number;
  cursor: LogCursor;
  steps: StepLog;
  notes: string[];
  lastNoteAt: number | undefined;
}

/** The run the message woke: the task's active run, waited for up to {@link progressTiming.runWaitMs}. */
async function runOf(
  ctx: FrontBotApi,
  deps: ProgressDeps,
  scene: Scene,
): Promise<string | undefined> {
  const until = deps.now().getTime() + progressTiming.runWaitMs;
  let runId = scene.issue.activeRun?.id;
  while (!readableRunId(runId) && deps.now().getTime() < until) {
    await deps.sleep(progressTiming.pollMs);
    runId = (await ctx.issues.get(scene.issue.id, scene.issue.companyId))?.activeRun?.id;
  }
  return readableRunId(runId) ? runId : undefined;
}

/** Whether a note is due now: enough time since the run's start and the last note, new steps, room left. */
function noteDue(watch: Watch, now: number): boolean {
  const { firstNoteAfterMs, noteGapMs, maxNotesPerRun } = progressTiming;
  if (watch.notes.length >= maxNotesPerRun || watch.steps.changed.length === 0) return false;
  if (now - watch.startedAt < firstNoteAfterMs) return false;
  return watch.lastNoteAt === undefined || now - watch.lastNoteAt >= noteGapMs;
}

/** Reads the new part of the log into the watch's steps. */
async function readOn(ctx: FrontBotApi, deps: ProgressDeps, watch: Watch): Promise<void> {
  const { companyId } = watch.scene.issue;
  const piece = await readLogPiece(
    ctx,
    deps.paperclipFetch,
    watch.settings,
    companyId,
    watch.runId,
    watch.cursor.offset,
  );
  const read = completeLines(watch.cursor, piece.content, piece.full);
  watch.cursor = read.cursor;
  watch.steps = readSteps(watch.steps, read.lines);
}

/** Calls Haiku for one note, checks it and keeps it when it passes. Runs inside the bot's serial queue. */
async function writeNote(
  ctx: FrontBotApi,
  deps: ProgressDeps,
  watch: Watch,
): Promise<FrontBotLogRecord> {
  const { companyId, id: taskId } = watch.scene.issue;
  const started = deps.now();
  const base = { at: started.toISOString(), companyId, taskId, runId: watch.runId };
  const budget = await readBudget(ctx, companyId, started);
  if (budget === "cap_reached") return notCalledRecord(base, "capped", budget, "progress_note");
  if (budget === "error_rate") return notCalledRecord(base, "stopped", budget, "progress_note");
  const input: ProgressInput = {
    agentName: watch.agentName,
    message: watch.scene.message.body,
    earlierNotes: watch.notes,
    steps: newSteps(watch.steps),
  };
  const call = await askFrontBot(
    ctx,
    deps,
    watch.settings.anthropicKey,
    companyId,
    progressRequest(input),
  );
  await recordCall(ctx, companyId, budget.health, deps.now(), !call.answered);
  const latencyMs = deps.now().getTime() - started.getTime();
  if (!call.answered)
    return { ...notCalledRecord(base, "failed", call.reason, "progress_note"), latencyMs };
  const cost = callCostMicroUsd(call.usage);
  await countSpend(ctx, companyId, budget.spend, cost);
  const called = (outcome: FrontBotOutcome, reason?: FrontBotReason): FrontBotLogRecord => ({
    ...base,
    callType: "progress_note",
    inputTokens: call.inputTokens,
    outputTokens: call.outputTokens,
    costMicroUsd: cost,
    latencyMs,
    outcome,
    reason,
  });
  if (call.answer.kind === "skip") return called("skip");
  const check = checkProgressNote(call.answer.line, input);
  if (!check.ok) return called("rejected", check.reason);
  if (await agentAnswered(ctx, watch.scene)) return called("rejected", "agent_answered");
  await rememberProgressNote(ctx.state, companyId, taskId, watch.runId, {
    at: base.at,
    text: call.answer.line,
  });
  watch.notes.push(call.answer.line);
  return called("posted");
}

/** Writes the one record of a note decision to the log and the metrics. */
async function report(ctx: FrontBotApi, record: FrontBotLogRecord): Promise<void> {
  ctx.logger.info(`Front bot: progress note ${record.outcome}.`, logMeta(record));
  const tags = {
    companyId: record.companyId,
    outcome: record.outcome,
    reason: record.reason ?? "none",
  };
  await writeMetrics(ctx, { "front_bot.progress_note": 1 }, tags);
}

/** Follows one run until it ends, the agent answers, the notes run out or the watch times out. */
async function follow(
  ctx: FrontBotApi,
  deps: ProgressDeps,
  inOrder: Serial,
  watch: Watch,
): Promise<void> {
  const { companyId } = watch.scene.issue;
  while (deps.now().getTime() - watch.startedAt < progressTiming.maxWatchMs) {
    await deps.sleep(progressTiming.pollMs);
    const live = await runIsLive(ctx, deps.paperclipFetch, watch.settings, companyId, watch.runId);
    if (!live || (await agentAnswered(ctx, watch.scene))) return;
    await readOn(ctx, deps, watch);
    const now = deps.now().getTime();
    if (!noteDue(watch, now)) continue;
    const record = await inOrder(() => writeNote(ctx, deps, watch));
    // Any call, kept or not, uses up the steps and the gap: no retry loop on the same steps.
    watch.steps = noteTaken(watch.steps);
    watch.lastNoteAt = now;
    await report(ctx, record);
    if (record.outcome === "capped" || record.outcome === "stopped") return;
    if (watch.notes.length >= progressTiming.maxNotesPerRun) return;
  }
}

/** The watch for a message, or undefined when notes are off or the message isn't the bot's business. */
async function watchFor(
  ctx: FrontBotApi,
  deps: ProgressDeps,
  event: PluginEvent,
  taskId: string,
  commentId: string | undefined,
): Promise<Watch | undefined> {
  const config = await companyConfig(ctx.config, event.companyId);
  const settings = config === undefined ? undefined : progressNotesOn(readFrontBotSettings(config));
  if (settings === undefined) return undefined;
  const scene = await sceneOf(ctx, event.companyId, taskId, commentId);
  if (scene === undefined || inputBlock(scene) !== undefined) return undefined;
  const runId = await runOf(ctx, deps, scene);
  if (runId === undefined) return undefined;
  const agents = await ctx.agents.list({ companyId: event.companyId, limit: 500 });
  const agentName = agents.find((agent) => agent.id === scene.agentId)?.name ?? "the agent";
  const startedAt = deps.now().getTime();
  return {
    scene,
    settings,
    runId,
    agentName,
    startedAt,
    cursor: startCursor,
    steps: emptyStepLog,
    notes: [],
    lastNoteAt: undefined,
  };
}

/** Progress notes for one plugin worker. */
export interface ProgressNotes {
  /**
   * A comment was created: follow the chat's run when it is a board user's
   * message on a chat task and no watcher follows that chat yet. Settles when
   * the watch ends; callers other than tests needn't wait, and it never rejects.
   */
  onCommentCreated(event: PluginEvent): Promise<void>;
}

/** The comment's task id and comment id, from the event's payload. */
function eventIds(event: PluginEvent): { taskId: string; commentId: string | undefined } {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const taskId = typeof payload["issueId"] === "string" ? payload["issueId"] : event.entityId;
  const commentId = typeof payload["commentId"] === "string" ? payload["commentId"] : undefined;
  return { taskId: taskId ?? "", commentId };
}

/**
 * Progress notes. `inOrder` is the first reply's serial queue, so both count
 * the day's spend from the same total. It never throws: a failure is one log
 * line with its code, and the chat shows no note.
 */
export function progressNotes(
  ctx: FrontBotApi,
  deps: ProgressDeps,
  inOrder: Serial,
): ProgressNotes {
  const watching = new Set<string>();
  return {
    async onCommentCreated(event) {
      const { taskId, commentId } = eventIds(event);
      // One watcher per chat: more messages during a run are part of the same run.
      if (taskId === "" || watching.has(taskId)) return;
      watching.add(taskId);
      try {
        const watch = await watchFor(ctx, deps, event, taskId, commentId);
        if (watch !== undefined) await follow(ctx, deps, inOrder, watch);
      } catch (error) {
        ctx.logger.error(`Front bot: progress notes stopped (${errorCode(error)}).`, {
          companyId: event.companyId,
        });
      } finally {
        watching.delete(taskId);
      }
    },
  };
}
