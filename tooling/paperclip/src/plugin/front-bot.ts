import type {
  PluginAgentsClient,
  PluginEvent,
  PluginIssuesClient,
  PluginLogger,
  PluginSecretsClient,
} from "@paperclipai/plugin-sdk";
import { checkReply } from "../front-bot/grounding.ts";
import { callCostMicroUsd } from "../front-bot/limits.ts";
import {
  type FrontBotLogRecord,
  type FrontBotOutcome,
  type FrontBotReason,
  logMeta,
  notCalledRecord,
} from "../front-bot/log-record.ts";
import { assistantLabel, frontBotRequest, parseFirstReply } from "../front-bot/prompt.ts";
import { choiceFor } from "../front-bot/run-choice.ts";
import { type FrontBotSettings, frontBotKey, readFrontBotSettings } from "../front-bot/settings.ts";
import { errorCode } from "./board-check-api.ts";
import {
  type Budget,
  type BudgetApi,
  countSpend,
  readBudget,
  recordCall,
  type Serial,
  serial,
} from "./front-bot-budget.ts";
import { askFrontBot, type FrontBotDeps } from "./front-bot-calls.ts";
import { answerLookup, type LookupDeps } from "./front-bot-lookup.ts";
import { postNote } from "./front-bot-notes.ts";
import { type PendingMessages, pendingMessages, storeRunChoice } from "./front-bot-run-choice.ts";
import { agentAnswered, inputBlock, inputOf, type Scene, sceneOf } from "./front-bot-scene.ts";
import { companyConfig } from "./job.ts";
import { writeMetrics } from "./metrics.ts";

/**
 * The front bot's first reply (HAL-19136, step 1 of the design on HAL-18847):
 * when a board user writes on a chat task, Haiku texts back in a few very
 * short lines that react to the message (HAL-19588), and the plugin posts
 * each line as its own comment, labelled as the assistant's, with no author,
 * which wakes nobody. It makes no call when the board turned
 * it off, the day's cap or the error stop holds, the message is out of scope
 * or holds something shaped like a key, or the agent already answered. A
 * reply that fails the grounding check is never posted. With its own setting
 * on too, it answers a plain PR or run status question from a read-only
 * source instead (HAL-19222, front-bot-lookup.ts). Every decision leaves one
 * log record with ids, numbers and a fixed reason code only.
 */

/** The part of the plugin context the front bot uses, so tests can fake it. */
export interface FrontBotApi extends BudgetApi {
  readonly issues: Pick<PluginIssuesClient, "get" | "listComments" | "createComment">;
  readonly agents: Pick<PluginAgentsClient, "list">;
  readonly secrets: Pick<PluginSecretsClient, "resolve">;
  readonly logger: Pick<PluginLogger, "info" | "error">;
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
  const firstReply = record.callType === "first_reply";
  ctx.logger.info(
    `Front bot: ${firstReply ? "first reply" : "lookup"} ${record.outcome}.`,
    logMeta(record),
  );
  const tags = {
    companyId: record.companyId,
    outcome: record.outcome,
    reason: record.reason ?? "none",
  };
  await writeMetrics(ctx, { [firstReply ? "front_bot.first_reply" : "front_bot.lookup"]: 1 }, tags);
}

/** The ids and time every record of one message carries. */
export type RecordBase = Pick<FrontBotLogRecord, "at" | "companyId" | "taskId" | "runId">;

/** A message the bot may call for: what it read, and the day's spend and call health before the call. */
interface Ready extends Budget {
  readonly scene: Scene;
  readonly settings: FrontBotSettings;
  readonly keyRef: NonNullable<ReturnType<typeof frontBotKey>>;
  readonly base: RecordBase;
  readonly started: Date;
}

/** A board user's message on a chat task with the bot on: the settings, what the bot read, and its records' ids. */
interface Message {
  readonly settings: FrontBotSettings;
  readonly scene: Scene;
  readonly base: RecordBase;
}

/**
 * The message, or undefined when it isn't the bot's business: the bot is
 * off, or the comment is out of scope. Then there is no record, and agents
 * work exactly as before.
 */
async function messageOf(
  ctx: FrontBotApi,
  deps: FrontBotDeps,
  event: PluginEvent,
): Promise<Message | undefined> {
  const { companyId } = event;
  const { taskId, commentId } = eventIds(event);
  const config = await companyConfig(ctx.config, companyId);
  const settings = config === undefined ? undefined : readFrontBotSettings(config);
  if (settings?.enabled !== true || taskId === undefined) {
    return undefined;
  }
  const scene = await sceneOf(ctx, companyId, taskId, commentId);
  if (scene === undefined) {
    return undefined;
  }
  const base = {
    at: deps.now().toISOString(),
    companyId,
    taskId: scene.issue.id,
    runId: scene.issue.activeRun?.id,
  };
  return { settings, scene, base };
}

/** Decides whether to call Haiku: a record when a rail stops the call, or what the call needs. */
async function beforeCall(
  ctx: FrontBotApi,
  deps: FrontBotDeps,
  { settings, scene, base }: Message,
): Promise<Ready | FrontBotLogRecord> {
  const stop = (outcome: FrontBotOutcome, reason: FrontBotReason) =>
    notCalledRecord(base, outcome, reason);
  const keyRef = frontBotKey(settings);
  if (keyRef === undefined) return stop("not_called", "no_key");
  const started = deps.now();
  const budget = await readBudget(ctx, scene.issue.companyId, started);
  if (budget === "cap_reached") return stop("capped", "cap_reached");
  if (budget === "error_rate") return stop("stopped", "error_rate");
  return { scene, settings, keyRef, base, started, ...budget };
}

/**
 * Front bot v2 (HAL-19219): keeps what the call said about the run, for the
 * server's run-start hook to read. A normal run is kept too, so the hook
 * learns at once that there is nothing to change. A failure to keep it only
 * means the run starts with its normal settings.
 */
async function keepRunChoice(ctx: FrontBotApi, ready: Ready, run: "quick" | "normal") {
  if (!ready.settings.runChoice) return;
  const { scene, base } = ready;
  try {
    await storeRunChoice(ctx.state, scene.issue.id, {
      commentId: scene.message.id,
      at: base.at,
      choice: choiceFor(run, ready.settings.quickRun) ?? null,
    });
  } catch (error) {
    ctx.logger.error(`Front bot: couldn't keep the run choice (${errorCode(error)}).`, {
      companyId: scene.issue.companyId,
    });
  }
}

/** How long the bot waits before a later line, as if typing it: 0.7 s and a bit per character, at most 2.5 s. */
export function lineDelayMs(line: string): number {
  return Math.min(2_500, 700 + 35 * line.length);
}

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** What posting a reply's lines came to: how many went out, and why the rest didn't. */
interface LinesPosted {
  readonly posted: number;
  readonly stop?: "agent_answered" | "post_failed";
  /** Whether some posted line's id wasn't kept (see `PostResult`). */
  readonly unsaved: boolean;
  /** When the first line went out; the reply's latency ends here, not after the pauses. */
  readonly firstPostedAt: Date | undefined;
}

/**
 * Posts each line as its own chat message, with a short pause before each
 * later one. Before every line it checks whether the agent answered while
 * Haiku wrote or the bot paused: then the line would talk over the agent, so
 * it and the rest stay unposted.
 */
async function postLines(
  ctx: FrontBotApi,
  deps: FrontBotDeps,
  { scene, base }: Ready,
  lines: readonly string[],
): Promise<LinesPosted> {
  const pause = deps.pause ?? waitFor;
  let posted = 0;
  let unsaved = false;
  let firstPostedAt: Date | undefined;
  for (const line of lines) {
    if (posted > 0) await pause(lineDelayMs(line));
    if (await agentAnswered(ctx, scene)) {
      return { posted, stop: "agent_answered", unsaved, firstPostedAt };
    }
    const body = `${assistantLabel}${line}`;
    const result = await postNote(ctx, scene.issue, body, { runId: base.runId, at: base.at });
    if (result === "failed") return { posted, stop: "post_failed", unsaved, firstPostedAt };
    posted += 1;
    firstPostedAt ??= deps.now();
    unsaved ||= result === "unsaved";
  }
  return { posted, unsaved, firstPostedAt };
}

/** Why a posted reply is not all there: a later line failed to post, or a line's id wasn't kept. */
function partReason(lines: LinesPosted): FrontBotReason | undefined {
  if (lines.stop === "post_failed") return "post_failed";
  return lines.unsaved ? "note_unsaved" : undefined;
}

/** Calls Haiku, counts the call, keeps its run choice, checks the reply and posts it when it passes. */
async function callAndPost(
  ctx: FrontBotApi,
  deps: FrontBotDeps,
  ready: Ready,
): Promise<FrontBotLogRecord> {
  const { scene, base, started } = ready;
  const { companyId } = scene.issue;
  const input = await inputOf(ctx, scene);
  const runChoice = ready.settings.runChoice;
  const call = await askFrontBot(
    ctx,
    deps,
    ready.keyRef,
    companyId,
    frontBotRequest(input, { runChoice }),
    runChoice,
  );
  await recordCall(ctx, companyId, ready.health, deps.now(), !call.answered);
  const latencyMs = (end: Date = deps.now()) => end.getTime() - started.getTime();
  if (!call.answered) {
    return { ...notCalledRecord(base, "failed", call.reason), latencyMs: latencyMs() };
  }
  await keepRunChoice(ctx, ready, call.run);
  const cost = callCostMicroUsd(call.usage);
  await countSpend(ctx, companyId, ready.spend, cost);
  const called = (
    outcome: FrontBotOutcome,
    reason?: FrontBotReason,
    end?: Date,
  ): FrontBotLogRecord => ({
    ...base,
    callType: "first_reply",
    inputTokens: call.inputTokens,
    outputTokens: call.outputTokens,
    costMicroUsd: cost,
    latencyMs: latencyMs(end),
    outcome,
    reason,
  });
  const reply = parseFirstReply(call.text);
  if (reply.kind === "skip") return called("skip");
  const grounding = checkReply(reply.lines, input);
  if (!grounding.ok) return called("rejected", grounding.reason);
  const lines = await postLines(ctx, deps, ready, reply.lines);
  if (lines.posted === 0) {
    return lines.stop === "agent_answered"
      ? called("rejected", "agent_answered")
      : called("failed", "post_failed");
  }
  const record = called("posted", partReason(lines), lines.firstPostedAt);
  await writeMetrics(ctx, { "front_bot.latency_ms": record.latencyMs }, { companyId });
  return record;
}

/**
 * One message, start to finish, and the records of what it decided: none when
 * it isn't the bot's business. Nothing goes out for a message shaped like a
 * key or one the agent already answered. With the lookups on, a plain lookup
 * question is answered from its source and needs no Haiku call; any other
 * message, or a lookup that goes to the agent, gets the first reply as before.
 */
async function handle(
  ctx: FrontBotApi,
  deps: FrontBotDeps & LookupDeps,
  event: PluginEvent,
): Promise<FrontBotLogRecord[]> {
  const message = await messageOf(ctx, deps, event);
  if (message === undefined) {
    return [];
  }
  const { scene, base } = message;
  const blocked = inputBlock(scene);
  if (blocked !== undefined) return [notCalledRecord(base, "not_called", blocked)];
  if (await agentAnswered(ctx, scene))
    return [notCalledRecord(base, "not_called", "agent_answered")];
  const lookup = message.settings.lookups ? await answerLookup(ctx, deps, scene, base) : undefined;
  if (lookup?.outcome === "posted") {
    return [lookup];
  }
  const ready = await beforeCall(ctx, deps, message);
  const reply = "scene" in ready ? await callAndPost(ctx, deps, ready) : ready;
  return lookup === undefined ? [reply] : [lookup, reply];
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
 * The front bot. Messages run one after another, and through `inOrder`
 * together with the progress notes, so the day's spend and the error window
 * are never counted from a stale total. It never throws: a failure is one log
 * line with its code and shows nothing in the chat.
 * `pending` lets the run-choice data key wait for a message still in work.
 */
export function frontBot(
  ctx: FrontBotApi,
  deps: FrontBotDeps & LookupDeps,
  inOrder: Serial = serial(),
  pending: PendingMessages = pendingMessages(),
): FrontBot {
  return {
    async onCommentCreated(event) {
      const work = async () => {
        try {
          for (const record of await handle(ctx, deps, event)) {
            await report(ctx, record);
          }
        } catch (error) {
          ctx.logger.error(`Front bot: couldn't handle a comment (${errorCode(error)}).`, {
            companyId: event.companyId,
          });
        }
      };
      const done = inOrder(work);
      const { commentId } = eventIds(event);
      if (commentId !== undefined) pending.track(commentId, done);
      await done;
    },
  };
}
