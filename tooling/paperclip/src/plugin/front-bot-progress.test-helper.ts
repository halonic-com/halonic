import { fakeMetrics, fakeState } from "./fake-host.test-helper.ts";
import {
  botOn,
  chatTaskId,
  chiefId,
  companyId,
  plantedKey,
  type StoredComment,
} from "./front-bot.test-helper.ts";
import type { FrontBotApi } from "./front-bot.ts";
import { serial } from "./front-bot-budget.ts";
import { type ProgressDeps, progressNotes } from "./front-bot-progress.ts";

/**
 * A plugin host for the progress notes' tests: a chat task with a running
 * agent run, the run's log growing on a fake clock, and recorded model
 * replies. Nothing here reaches the network (HAL-18847 section 7, point 2).
 */

export const runId = "6d1f0c2a-3b4e-4f5a-8b6c-7d8e9f0a1b2c";

/** Settings with the bot, its notes and Paperclip's API on. */
export const notesOn = {
  ...botOn,
  frontBotNotesEnabled: true,
  paperclipApiUrl: "http://paperclip.test",
  paperclipApiKey: { type: "secret_ref", secretId: "secret-paperclip" },
};

/** One log entry: ACPX records the run writes this many ms after the message. */
export interface LogEntry {
  readonly afterMs: number;
  readonly records: readonly Record<string, unknown>[];
}

/** A tool call record as ACPX writes it. */
export function toolCall(id: string, fields: Record<string, unknown>): Record<string, unknown> {
  return { type: "acpx.tool_call", toolCallId: id, tag: "tool_call", ...fields };
}

/** How a recorded Anthropic call answers. */
export type NoteAnswer = { readonly reply: string } | { readonly status: number };

/** Options for one harness. */
export interface ProgressOptions {
  readonly config?: Record<string, unknown>;
  readonly log?: readonly LogEntry[];
  readonly answers?: readonly NoteAnswer[];
  /** When the run stops being live, in ms after the message; never by default. */
  readonly runEndsAfterMs?: number;
  /** When the run shows on the task, in ms after the message; at once by default. */
  readonly runStartsAfterMs?: number;
  /** When the chat's agent answers, in ms after the message; never by default. */
  readonly agentAnswersAfterMs?: number;
  readonly spentMicroUsd?: number;
}

const messageAt = new Date("2026-11-26T14:03:00Z").getTime();

/** A harness: the notes, their fake host, and everything sent, logged and kept. */
export function progressHarness(options: ProgressOptions = {}) {
  let clock = messageAt + 300;
  const elapsed = () => clock - messageAt;
  const { metrics } = fakeMetrics();
  const { state } = fakeState();
  const comments: StoredComment[] = [
    {
      id: "comment-1",
      companyId,
      issueId: chatTaskId,
      authorAgentId: null,
      authorUserId: "user-board",
      body: "Is #6129 merged yet?",
      createdAt: new Date(messageAt),
    },
  ];
  const addComment = (comment: Omit<StoredComment, "id" | "companyId" | "issueId">) => {
    const stored = {
      ...comment,
      id: `comment-${comments.length + 1}`,
      companyId,
      issueId: chatTaskId,
    };
    comments.push(stored);
    return stored;
  };
  const runShows = () => elapsed() >= (options.runStartsAfterMs ?? 0);
  const task = () => ({
    id: chatTaskId,
    companyId,
    identifier: "HAL-10",
    title: "Merge #6129",
    conversationAgentId: chiefId,
    activeRun: runShows() ? { id: runId } : null,
  });
  const logText = () =>
    (options.log ?? [])
      .filter((entry) => entry.afterMs <= elapsed())
      .map((entry) => {
        const chunk = entry.records.map((record) => `${JSON.stringify(record)}\n`).join("");
        return `${JSON.stringify({ ts: new Date(messageAt + entry.afterMs).toISOString(), stream: "stdout", chunk })}\n`;
      })
      .join("");
  const paperclipReads: { url: string; headers: Record<string, string> }[] = [];
  const anthropicBodies: string[] = [];
  const answers = [...(options.answers ?? [])];
  const logs: { level: string; line: string; meta: unknown }[] = [];
  const deps: ProgressDeps = {
    now: () => new Date(clock),
    sleep: async (ms) => {
      clock += ms;
      const answerAt = options.agentAnswersAfterMs;
      if (
        answerAt !== undefined &&
        elapsed() >= answerAt &&
        !comments.some((c) => c.authorAgentId === chiefId)
      ) {
        addComment({
          authorAgentId: chiefId,
          authorUserId: null,
          body: "Merged at 14:02.",
          createdAt: new Date(clock),
        });
      }
    },
    paperclipFetch: async (url, init) => {
      const address = new URL(String(url));
      paperclipReads.push({
        url: String(url),
        headers: (init?.headers ?? {}) as Record<string, string>,
      });
      if (address.pathname === `/api/heartbeat-runs/${runId}`) {
        const ended = options.runEndsAfterMs !== undefined && elapsed() >= options.runEndsAfterMs;
        return Response.json({ id: runId, status: ended ? "succeeded" : "running" });
      }
      if (address.pathname === `/api/heartbeat-runs/${runId}/log`) {
        const offset = Number(address.searchParams.get("offset"));
        const limit = Number(address.searchParams.get("limitBytes"));
        const content = Buffer.from(logText())
          .subarray(offset, offset + limit)
          .toString("utf8");
        return Response.json({ runId, content });
      }
      return new Response("{}", { status: 404 });
    },
    anthropicFetch: async (_url, init) => {
      anthropicBodies.push(String(init?.body ?? ""));
      const recorded = answers.shift() ?? { status: 500 };
      if ("status" in recorded) {
        return new Response(`{"error":{"message":"upstream said ${plantedKey}"}}`, {
          status: recorded.status,
        });
      }
      const usage = { input_tokens: 2700, output_tokens: 40 };
      return Response.json({ content: [{ type: "text", text: recorded.reply }], usage });
    },
  };
  const ctx = {
    metrics,
    state,
    config: { get: async () => options.config ?? notesOn },
    secrets: { resolve: async () => plantedKey },
    logger: {
      info: (line: string, meta?: unknown) => logs.push({ level: "info", line, meta }),
      error: (line: string, meta?: unknown) => logs.push({ level: "error", line, meta }),
    },
    agents: { list: async () => [{ id: chiefId, name: "Chief" }] },
    issues: {
      get: async (id: string, company: string) =>
        id === chatTaskId && company === companyId ? task() : null,
      listComments: async () => comments,
      createComment: async (_issueId: string, body: string) =>
        addComment({ authorAgentId: null, authorUserId: null, body, createdAt: new Date(clock) }),
    },
  };
  if (options.spentMicroUsd !== undefined) {
    void state.set(
      { scopeKind: "company", scopeId: companyId, namespace: "front-bot", stateKey: "spend" },
      { day: "2026-11-26", microUsd: options.spentMicroUsd, warned: true },
    );
  }
  const notes = progressNotes(ctx as unknown as FrontBotApi, deps, serial());
  return {
    notes,
    ctx,
    state,
    logs,
    comments,
    addComment,
    paperclipReads,
    anthropicBodies,
    elapsed,
  };
}
