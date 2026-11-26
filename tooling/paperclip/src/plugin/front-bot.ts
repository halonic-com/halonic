import { findSecretShape } from "@halonicjs/std";
import type {
  IssueComment,
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
import { automaticNotePrefix, type FrontBotInput, frontBotUserText } from "../front-bot/prompt.ts";
import { frontBotKey, readFrontBotSettings } from "../front-bot/settings.ts";
import type { StateApi } from "../snapshot/store.ts";
import { errorCode } from "./board-check-api.ts";
import { askFrontBot, type FrontBotDeps } from "./front-bot-calls.ts";
import { automaticNoteIds, isAutomaticNote, rememberNote } from "./front-bot-notes.ts";
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

type Issue = NonNullable<Awaited<ReturnType<FrontBotApi["issues"]["get"]>>>;

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

/** What the bot reads before it decides: the task, the person's message and the comments around it. */
interface Scene {
  readonly issue: Issue;
  readonly agentId: string;
  readonly message: IssueComment;
  readonly before: readonly IssueComment[];
  readonly ownIds: ReadonlySet<string>;
}

/** The chat task and a board user's message on it, or undefined when the message is out of scope. */
async function sceneOf(
  ctx: FrontBotApi,
  companyId: string,
  taskId: string,
  commentId: string | undefined,
) {
  const issue = await ctx.issues.get(taskId, companyId);
  const agentId = issue?.conversationAgentId ?? null;
  if (issue === null || issue.companyId !== companyId || agentId === null) {
    return undefined;
  }
  const comments = await ctx.issues.listComments(issue.id, companyId);
  const index =
    commentId === undefined ? comments.length - 1 : comments.findIndex((c) => c.id === commentId);
  const message = comments[index];
  const ownIds = await automaticNoteIds(ctx.state, companyId, issue.id);
  // Only a person's message: never an agent's, never a plugin's or Paperclip's, never the bot's own.
  if (message === undefined || message.authorAgentId !== null || message.authorUserId === null) {
    return undefined;
  }
  if (isAutomaticNote(message, ownIds)) {
    return undefined;
  }
  return { issue, agentId, message, before: comments.slice(0, index), ownIds } satisfies Scene;
}

/** Whether the chat's agent wrote after the message: then the bot stays quiet for good. */
async function agentAnswered(ctx: FrontBotApi, scene: Scene): Promise<boolean> {
  const comments = await ctx.issues.listComments(scene.issue.id, scene.issue.companyId);
  const sentAt = new Date(scene.message.createdAt).getTime();
  return comments.some(
    (comment) =>
      comment.authorAgentId === scene.agentId && new Date(comment.createdAt).getTime() >= sentAt,
  );
}

/** The input the bot sends: the bot's own comments and anything shaped like a key left out. */
async function inputOf(ctx: FrontBotApi, scene: Scene): Promise<FrontBotInput> {
  const agents = await ctx.agents.list({ companyId: scene.issue.companyId, limit: 500 });
  const names = new Map(agents.map((agent) => [agent.id, agent.name]));
  const earlier = scene.before
    .filter(
      (comment) =>
        !isAutomaticNote(comment, scene.ownIds) && findSecretShape(comment.body) === undefined,
    )
    .map((comment) => ({
      author:
        comment.authorAgentId === null ? "board" : (names.get(comment.authorAgentId) ?? "an agent"),
      at: new Date(comment.createdAt),
      body: comment.body,
    }));
  return {
    title: scene.issue.title,
    message: scene.message.body,
    messageAt: new Date(scene.message.createdAt),
    earlier,
  };
}

/** Why the bot makes no call before it reads its limits, or undefined when it may. */
function inputBlock(scene: Scene): FrontBotReason | undefined {
  const secret = findSecretShape(scene.message.body) ?? findSecretShape(scene.issue.title);
  return secret === undefined ? undefined : "secret_in_input";
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

/** One message, start to finish. Returns the record of what it decided. */
async function handle(
  ctx: FrontBotApi,
  deps: FrontBotDeps,
  event: PluginEvent,
): Promise<FrontBotLogRecord | undefined> {
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
  const skip = (outcome: FrontBotOutcome, reason: FrontBotReason) =>
    notCalledRecord(base, outcome, reason);
  const keyRef = frontBotKey(settings);
  if (keyRef === undefined) return skip("not_called", "no_key");
  const blocked = inputBlock(scene);
  if (blocked !== undefined) return skip("not_called", blocked);
  if (await agentAnswered(ctx, scene)) return skip("not_called", "agent_answered");
  const spend = spendFor(
    (await ctx.state.get(companyKey(companyId, "spend"))) as DaySpend | null,
    spendDay(started),
  );
  if (capReached(spend)) return skip("capped", "cap_reached");
  const health =
    ((await ctx.state.get(companyKey(companyId, "health"))) as CallHealth | null) ?? freshHealth;
  if (stoppedForErrors(health, started)) return skip("stopped", "error_rate");

  const input = await inputOf(ctx, scene);
  const call = await askFrontBot(ctx, deps, keyRef, companyId, input);
  await ctx.state.set(
    companyKey(companyId, "health"),
    afterCall(health, deps.now(), !call.answered),
  );
  const latencyMs = () => deps.now().getTime() - started.getTime();
  if (!call.answered) {
    return { ...skip("failed", call.reason), latencyMs: latencyMs() };
  }
  const cost = callCostMicroUsd(call.usage);
  await countSpend(ctx, companyId, spend, cost);
  const called = (
    outcome: FrontBotOutcome,
    reason: FrontBotReason | undefined,
  ): FrontBotLogRecord => ({
    ...base,
    callType: "first_reply",
    inputTokens: call.inputTokens,
    outputTokens: call.outputTokens,
    costMicroUsd: cost,
    latencyMs: latencyMs(),
    outcome,
    reason,
  });
  if (call.answer.kind === "skip") return called("skip", undefined);
  const grounding = checkGrounding(call.answer.line, frontBotUserText(input));
  if (!grounding.ok) return called("rejected", grounding.reason);
  // The agent may have answered while Haiku wrote: then the line would talk over it.
  if (await agentAnswered(ctx, scene)) return called("rejected", "agent_answered");
  try {
    const posted = await ctx.issues.createComment(
      scene.issue.id,
      `${automaticNotePrefix}${call.answer.line}`,
      companyId,
    );
    await rememberNote(ctx.state, companyId, scene.issue.id, {
      commentId: posted.id,
      runId: base.runId,
      at: base.at,
    });
  } catch {
    return called("failed", "post_failed");
  }
  const record = called("posted", undefined);
  await writeMetrics(ctx, { "front_bot.latency_ms": record.latencyMs }, { companyId });
  return record;
}

/** The front bot for one plugin worker. */
export interface FrontBot {
  /** A comment was created: write a first reply when it is a board user's message on a chat task. */
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
