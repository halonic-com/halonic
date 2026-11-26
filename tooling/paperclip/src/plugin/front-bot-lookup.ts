import type { PluginAgentsClient, PluginIssuesClient } from "@paperclipai/plugin-sdk";
import type {
  FrontBotLogRecord,
  FrontBotOutcome,
  FrontBotReason,
} from "../front-bot/log-record.ts";
import {
  answerFor,
  checkLookupAnswer,
  type HandOver,
  type LookupQuestion,
  type LookupResult,
  matchLookup,
  type PrStatusResult,
} from "../front-bot/lookups.ts";
import { type PrStatus, prStatus } from "../pr-tools/pr-status.ts";
import type { FrontBotApi, RecordBase } from "./front-bot.ts";
import { withTimeout } from "./front-bot-calls.ts";
import { postNote } from "./front-bot-notes.ts";
import { agentAnswered, type Scene } from "./front-bot-scene.ts";
import { companyGitHub, type ToolsApi } from "./tools.ts";

/**
 * The front bot's Studio lookups in the plugin (HAL-19222): reads a plain
 * lookup question, asks its one read-only source, and posts the answer built
 * from the result with its label. The sources get read functions only, so a
 * lookup can't act; a failed, empty or mismatched read posts nothing and the
 * message goes on to the agent as before.
 */

/** A lookup only helps within seconds; a slower source goes to the agent instead. */
const lookupTimeoutMs = 8_000;

/** What the lookups reach outside the plugin context, so tests replace it with recorded results. */
export interface LookupDeps {
  readonly now: () => Date;
  /**
   * The PR status lookup's source: one pull request on the company's first
   * watched repository, read from GitHub with GET requests only and the
   * company's read-only token ({@link gitHubPrStatus}).
   */
  readonly readPrStatus: (companyId: string, pr: number) => Promise<PrStatusResult>;
}

/**
 * What the sources may use: reads only. The lookups never get the plugin
 * context itself, so no lookup can comment, assign or call GitHub with
 * anything but GET.
 */
interface LookupReaders {
  readonly readPrStatus: LookupDeps["readPrStatus"];
  readonly issues: Pick<PluginIssuesClient, "get">;
  readonly agents: Pick<PluginAgentsClient, "list">;
}

/** The facts of `pr_status` an answer may say, and nothing else (no title, branch or author). */
export function prStatusResult(status: PrStatus): PrStatusResult {
  return {
    kind: "pr_status",
    pr: status.number,
    state: status.state,
    draft: status.draft,
    ciOk: status.ciOk,
    mergeable: status.mergeable,
    inQueue: status.inQueue,
    approvedOnHead: status.approvedOnHead,
  };
}

/**
 * The PR status source: the `pr_status` tool's own read, on the company's
 * first watched repository, with its read-only token and GET requests only.
 */
export function gitHubPrStatus(
  ctx: Pick<ToolsApi, "config" | "secrets" | "http">,
): LookupDeps["readPrStatus"] {
  return async (companyId, pr) => {
    const github = await companyGitHub(ctx, companyId);
    const repo = github.repos[0];
    if (repo === undefined) {
      throw new Error("no repository is watched.");
    }
    return prStatusResult(await prStatus(github.get, repo, pr));
  };
}

/** The run status source: the task from Paperclip, its status and its queued or running run. */
async function readRunStatus(
  readers: LookupReaders,
  companyId: string,
  task: string,
): Promise<LookupResult | HandOver> {
  const issue = await readers.issues.get(task, companyId);
  if (issue === null || issue.companyId !== companyId) {
    return "lookup_not_found";
  }
  const run = issue.activeRun ?? undefined;
  const agents = run === undefined ? [] : await readers.agents.list({ companyId, limit: 500 });
  return {
    kind: "run_status",
    task: issue.identifier ?? "",
    status: issue.status,
    run:
      run === undefined
        ? undefined
        : {
            status: run.status,
            agentName: agents.find((agent) => agent.id === run.agentId)?.name,
            startedAt: run.startedAt === null ? undefined : new Date(run.startedAt),
          },
  };
}

/** Asks the question's one source; a thrown read or a timeout is `lookup_failed`. */
async function readLookup(
  readers: LookupReaders,
  companyId: string,
  question: LookupQuestion,
): Promise<LookupResult | HandOver> {
  try {
    const result = await withTimeout(
      () =>
        question.kind === "pr_status"
          ? readers.readPrStatus(companyId, question.pr)
          : readRunStatus(readers, companyId, question.task),
      lookupTimeoutMs,
    );
    return result === "timeout" ? "lookup_failed" : result;
  } catch {
    return "lookup_failed";
  }
}

/**
 * Answers the message when it is one of the lookups: a record of what
 * happened, or undefined when it isn't a lookup question at all. Only a
 * `posted` record means the bot answered; anything else goes to the agent.
 */
export async function answerLookup(
  ctx: FrontBotApi,
  deps: LookupDeps,
  scene: Scene,
  base: RecordBase,
): Promise<FrontBotLogRecord | undefined> {
  const match = matchLookup(scene.message.body);
  if (!match.matched) {
    // Asking for an action is worth a record; any other message isn't a lookup's business.
    return match.reason === "write_request"
      ? record(base, "lookup", "handed_over", "write_request", 0)
      : undefined;
  }
  const { question } = match;
  const callType = `lookup_${question.kind}` as const;
  const started = deps.now().getTime();
  const latency = () => deps.now().getTime() - started;
  const readers: LookupReaders = {
    readPrStatus: deps.readPrStatus,
    issues: ctx.issues,
    agents: ctx.agents,
  };
  const result = await readLookup(readers, scene.issue.companyId, question);
  if (typeof result === "string") {
    return record(base, callType, "handed_over", result, latency());
  }
  const answer = answerFor(question, result);
  if (!answer.ok) {
    return record(base, callType, "handed_over", answer.reason, latency());
  }
  // The last gate: the body is exactly what this result says to this question.
  if (!checkLookupAnswer(answer.body, question, result)) {
    return record(base, callType, "handed_over", "lookup_mismatch", latency());
  }
  // The agent may have answered while the source was read: then the answer would talk over it.
  if (await agentAnswered(ctx, scene)) {
    return record(base, callType, "handed_over", "agent_answered", latency());
  }
  const posted = await postNote(ctx, scene.issue, answer.body, { runId: base.runId, at: base.at });
  if (posted === "failed") {
    return record(base, callType, "failed", "post_failed", latency());
  }
  const reason = posted === "unsaved" ? "note_unsaved" : undefined;
  return record(base, callType, "posted", reason, latency());
}

/** A lookup's log record: no tokens and no cost, since no model is called. */
function record(
  base: RecordBase,
  callType: FrontBotLogRecord["callType"],
  outcome: FrontBotOutcome,
  reason: FrontBotReason | undefined,
  latencyMs: number,
): FrontBotLogRecord {
  return {
    ...base,
    callType,
    inputTokens: 0,
    outputTokens: 0,
    costMicroUsd: 0,
    latencyMs,
    outcome,
    reason,
  };
}
