import type {
  PluginAgentsClient,
  PluginConfigClient,
  PluginEvent,
  PluginIssuesClient,
  PluginLogger,
  PluginSecretsClient,
} from "@paperclipai/plugin-sdk";
import { checkGrounding } from "../front-bot/grounding.ts";
import {
  afterCall,
  type CallHealth,
  callCostMicroUsd,
  capReached,
  type DaySpend,
  freshHealth,
  shouldWarn,
  spendDay,
  spendFor,
  stoppedForErrors,
} from "../front-bot/limits.ts";
import {
  type FrontBotLogRecord,
  type FrontBotOutcome,
  type FrontBotReason,
  logMeta,
  notCalledRecord,
} from "../front-bot/log-record.ts";
import { automaticNotePrefix } from "../front-bot/prompt.ts";
import { frontBotKey, readFrontBotSettings } from "../front-bot/settings.ts";
import type { StateApi } from "../snapshot/store.ts";
import { errorCode } from "./board-check-api.ts";
import { askFrontBot, type FrontBotDeps } from "./front-bot-calls.ts";
import { rememberNote } from "./front-bot-notes.ts";
import { agentAnswered, inputBlock, inputOf, type Scene, sceneOf } from "./front-bot-scene.ts";
import { companyConfig } from "./job.ts";
import { type MetricsApi, writeMetrics } from "./metrics.ts";

/**
 * The front bot's first reply (HAL-19136, step 1 of the design on HAL-18847):
 * when a board user writes on a chat task, Haiku writes one or two sentences
 * that say something useful, and the plugin posts them as an Automatic note
 * with no author, which wakes nobody. It makes no call when the board turned
 * it off, the day's cap or the error stop holds, the message is out of scope
 * or holds something shaped like a key, or the agent already answered. A
 * reply that fails the grounding check is never posted. Every decision leaves
 * one log record with ids, numbers and a fixed reason code only.
 */

/** The part of the plugin context the front bot uses, so tests can fake it. */
export interface FrontBotApi extends MetricsApi, StateApi {
  readonly issues: Pick<PluginIssuesClient, "get" | "listComments" | "createComment">;
  readonly agents: Pick<PluginAgentsClient, "list">;
  readonly config: PluginConfigClient;
  readonly secrets: Pick<PluginSecretsClient, "resolve">;
  readonly logger: Pick<PluginLogger, "info" | "error">;
}

function companyKey(companyId: string, stateKey: "spend" | "health") {
  return { scopeKind: "company", scopeId: companyId, namespace: "front-bot", stateKey } as const;
}

/** The comment's task id and comment id, from the event's payload. */
function eventIds(event: PluginEvent): { taskId?: string; commentId?: string } {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const taskId = typeof payload["issueId"] === "string" ? payload["issueId"] : event.entityId;
  const commentId = typeof payload["commentId"] === "string" ? payload["commentId"] : undefined;
  return {
    ...(taskId === undefined ? {} : { taskId }),
    ...(commentId === undefined ? {} : { commentId }),
  };
}

/** Writes the one record of a decision to the log and the metrics. */
async function report(ctx: FrontBotApi, record: FrontBotLogRecord): Promise<void> {
  ctx.logger.info(`Front bot: first reply ${record.outcome}.`, logMeta(record));
  const tags = {
    companyId: record.companyId,
    outcome: record.outcome,
    reason: record.reason ?? "none",
  };
  await writeMetrics(ctx, { "front_bot.first_reply": 1 }, tags);
}

/** Counts a call's cost; tells Chief once a day at 80% of the cap. */
async function countSpend(ctx: FrontBotApi, companyId: string, spend: DaySpend, cost: number) {
  const next = { ...spend, microUsd: spend.microUsd + cost };
  const warn = shouldWarn(next);
  await ctx.state.set(companyKey(companyId, "spend"), { ...next, warned: next.warned || warn });
  await writeMetrics(ctx, { "front_bot.spend_micro_usd": cost }, { companyId });
  const config = await companyConfig(ctx.config, companyId);
  const chiefTask = config?.["chiefTask"];
  if (warn && typeof chiefTask === "string" && chiefTask !== "") {
    const dollars = (next.microUsd / 1_000_000).toFixed(2);
    const body = `Front bot: $${dollars} spent today, 80% of the $3 daily cap. At $3 it stops until 00:00 UTC.`;
    await ctx.issues.createComment(chiefTask, body, companyId);
  }
}

/** The ids and time every record of one message carries. */
type RecordBase = Pick<FrontBotLogRecord, "at" | "companyId" | "taskId" | "runId">;

/** A message the bot may call for: what it read, and the day's spend and call health before the call. */
interface Ready {
  readonly scene: Scene;
  readonly keyRef: NonNullable<ReturnType<typeof frontBotKey>>;
  readonly base: RecordBase;
  readonly started: Date;
  readonly spend: DaySpend;
  readonly health: CallHealth;
}

/**
 * Decides whether to call: undefined when the message isn't the bot's
 * business (off or out of scope: no record), a record when a rail stops the
 * call, or what the call needs.
 */
async function beforeCall(
  ctx: FrontBotApi,
  deps: FrontBotDeps,
  event: PluginEvent,
): Promise<Ready | FrontBotLogRecord | undefined> {
  const { companyId } = event;
  const { taskId, commentId } = eventIds(event);
  const config = await companyConfig(ctx.config, companyId);
  const settings = config === undefined ? undefined : readFrontBotSettings(config);
  // Off, or out of scope: no call, no record, and agents work exactly as before.
  if (settings?.enabled !== true || taskId === undefined) {
    return undefined;
  }
  const scene = await sceneOf(ctx, companyId, taskId, commentId);
  if (scene === undefined) {
    return undefined;
  }
  const started = deps.now();
  const base = {
    at: started.toISOString(),
    companyId,
    taskId: scene.issue.id,
    runId: scene.issue.activeRun?.id,
  };
  const stop = (outcome: FrontBotOutcome, reason: FrontBotReason) =>
    notCalledRecord(base, outcome, reason);
  const keyRef = frontBotKey(settings);
  if (keyRef === undefined) return stop("not_called", "no_key");
  const blocked = inputBlock(scene);
  if (blocked !== undefined) return stop("not_called", blocked);
  if (await agentAnswered(ctx, scene)) return stop("not_called", "agent_answered");
  const stored = (await ctx.state.get(companyKey(companyId, "spend"))) as DaySpend | null;
  const spend = spendFor(stored, spendDay(started));
  if (capReached(spend)) return stop("capped", "cap_reached");
  const health =
    ((await ctx.state.get(companyKey(companyId, "health"))) as CallHealth | null) ?? freshHealth;
  if (stoppedForErrors(health, started)) return stop("stopped", "error_rate");
  return { scene, keyRef, base, started, spend, health };
}

/**
 * What posting the note came to: not posted, posted and its id kept, or
 * posted but its id not kept. The readers still skip an unkept note by its
 * prefix, so it is logged as posted with its own reason.
 */
type PostResult = "failed" | "posted" | "unsaved";

/** Posts the line as an Automatic note with no author and keeps its id. */
async function postNote(
  ctx: FrontBotApi,
  scene: Scene,
  line: string,
  base: RecordBase,
): Promise<PostResult> {
  const { companyId, id } = scene.issue;
  let commentId: string;
  try {
    const posted = await ctx.issues.createComment(id, `${automaticNotePrefix}${line}`, companyId);
    commentId = posted.id;
  } catch {
    return "failed";
  }
  try {
    await rememberNote(ctx.state, companyId, id, { commentId, runId: base.runId, at: base.at });
    return "posted";
  } catch {
    return "unsaved";
  }
}

/** Calls Haiku, counts the call, checks the reply and posts it when it passes. */
async function callAndPost(
  ctx: FrontBotApi,
  deps: FrontBotDeps,
  ready: Ready,
): Promise<FrontBotLogRecord> {
  const { scene, base, started } = ready;
  const { companyId } = scene.issue;
  const input = await inputOf(ctx, scene);
  const call = await askFrontBot(ctx, deps, ready.keyRef, companyId, input);
  await ctx.state.set(
    companyKey(companyId, "health"),
    afterCall(ready.health, deps.now(), !call.answered),
  );
  const latencyMs = () => deps.now().getTime() - started.getTime();
  if (!call.answered) {
    return { ...notCalledRecord(base, "failed", call.reason), latencyMs: latencyMs() };
  }
  const cost = callCostMicroUsd(call.usage);
  await countSpend(ctx, companyId, ready.spend, cost);
  const called = (outcome: FrontBotOutcome, reason?: FrontBotReason): FrontBotLogRecord => ({
    ...base,
    callType: "first_reply",
    inputTokens: call.inputTokens,
    outputTokens: call.outputTokens,
    costMicroUsd: cost,
    latencyMs: latencyMs(),
    outcome,
    reason,
  });
  if (call.answer.kind === "skip") return called("skip");
  const grounding = checkGrounding(call.answer.line, input);
  if (!grounding.ok) return called("rejected", grounding.reason);
  // The agent may have answered while Haiku wrote: then the line would talk over it.
  if (await agentAnswered(ctx, scene)) return called("rejected", "agent_answered");
  const posted = await postNote(ctx, scene, call.answer.line, base);
  if (posted === "failed") return called("failed", "post_failed");
  const record = called("posted", posted === "unsaved" ? "note_unsaved" : undefined);
  await writeMetrics(ctx, { "front_bot.latency_ms": record.latencyMs }, { companyId });
  return record;
}

/** One message, start to finish. Returns the record of what it decided, or undefined when there is none. */
async function handle(
  ctx: FrontBotApi,
  deps: FrontBotDeps,
  event: PluginEvent,
): Promise<FrontBotLogRecord | undefined> {
  const ready = await beforeCall(ctx, deps, event);
  return ready === undefined || !("scene" in ready) ? ready : await callAndPost(ctx, deps, ready);
}

/** The front bot for one plugin worker. */
export interface FrontBot {
  /**
   * A comment was created: write a first reply when it is a board user's
   * message on a chat task. Settles once this message is handled; callers
   * other than tests needn't wait for it, and it never rejects.
   */
  onCommentCreated(event: PluginEvent): Promise<void>;
}

/**
 * The front bot. Messages run one after another, so the day's spend and the
 * error window are never counted from a stale total. It never throws: a
 * failure is one log line with its code and shows nothing in the chat.
 */
export function frontBot(ctx: FrontBotApi, deps: FrontBotDeps): FrontBot {
  let queue: Promise<void> = Promise.resolve();
  return {
    async onCommentCreated(event) {
      const work = async () => {
        try {
          const record = await handle(ctx, deps, event);
          if (record !== undefined) {
            await report(ctx, record);
          }
        } catch (error) {
          ctx.logger.error(`Front bot: couldn't handle a comment (${errorCode(error)}).`, {
            companyId: event.companyId,
          });
        }
      };
      queue = queue.then(work);
      await queue;
    },
  };
}
