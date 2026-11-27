import type { PluginEvent } from "@paperclipai/plugin-sdk";
import type { PrStatusResult } from "../front-bot/lookups.ts";
import type { ChatMemory } from "../front-bot/prompt.ts";
import { fakeMetrics, fakeState } from "./fake-host.test-helper.ts";
import { frontBot } from "./front-bot.ts";
import type { FrontBotDeps } from "./front-bot-calls.ts";
import type { LookupDeps } from "./front-bot-lookup.ts";
import { writeMemory } from "./front-bot-memory.ts";

/**
 * A plugin host for the front bot's tests, with a chat task, its comments and
 * recorded model replies in memory. Nothing here reaches the network: the
 * bot's `fetch` answers from the recording (HAL-18847 section 7, point 2).
 */

/** The planted fake key (must-fail test 5): it may appear only in the request's key header. */
export const plantedKey = `sk-ant-api03-${"Q7x2Lm9K".repeat(4)}`;

export const companyId = "acme";
export const chatTaskId = "0b5c2f9e-4d1a-4c3b-9a8e-1f2d3c4b5a69";
export const chiefId = "agent-chief";
export const boardUserId = "user-board";

/** An earlier comment in an example: `board` for a person, else an agent's name. */
export interface ExampleComment {
  readonly author: string;
  readonly at: string;
  readonly body: string;
}

/** One recorded example from `src/front-bot/examples/*.json`. */
export interface FrontBotExample {
  readonly name: string;
  readonly title: string;
  readonly earlier: readonly ExampleComment[];
  readonly message: string;
  readonly reply: string;
  readonly expect: "posted" | "skip" | "rejected";
  readonly reason?: string;
  /** What the bot remembers for the message (HAL-19597); turns the memory on. */
  readonly memory?: ChatMemory;
}

/** A comment as the fake host keeps it. */
export interface StoredComment {
  id: string;
  companyId: string;
  issueId: string;
  authorAgentId: string | null;
  authorUserId: string | null;
  body: string;
  createdAt: Date;
}

/**
 * How the recorded Anthropic answers: a reply text, an HTTP status, a thrown
 * network error, or never, ignoring the abort signal like the host's `fetch`.
 */
export type Recorded =
  | { readonly reply: string }
  | { readonly status: number }
  | { readonly throws: string }
  | { readonly hangs: true };

/** Options for one harness. */
export interface HarnessOptions {
  readonly title?: string;
  readonly earlier?: readonly ExampleComment[];
  readonly message?: string;
  readonly answers?: readonly Recorded[];
  readonly config?: Record<string, unknown>;
  /** The chat's agent; null makes the task an ordinary, non-chat task. */
  readonly conversationAgentId?: string | null;
  /** Comments the agent writes while Haiku answers (must-fail test 3). */
  readonly agentAnswersDuringCall?: boolean;
  /** What GitHub's PR status source gives per pull request; any other number fails (HAL-19222). */
  readonly pulls?: Readonly<Record<number, PrStatusResult | "hangs">>;
  /** Runs at each pause between a reply's lines, such as the agent answering meanwhile. */
  readonly onPause?: () => void;
  /** Posting fails from this line on (1-based), as if the host refused the comment. */
  readonly postFailsFrom?: number;
  /** The memory already kept for the chat and its board user; turns the memory on (HAL-19597). */
  readonly memory?: ChatMemory;
  /** Other tasks of the company, found by their identifier, for the run status lookup. */
  readonly tasks?: readonly OtherTask[];
}

/** A task the run status lookup can read. */
export interface OtherTask {
  readonly identifier: string;
  readonly companyId?: string;
  readonly status: string;
  readonly activeRun?: {
    readonly status: string;
    readonly agentId: string;
    readonly startedAt: string | null;
  } | null;
}

/** Settings with the bot on and its key stored. */
export const botOn = {
  frontBotEnabled: true,
  frontBotAnthropicKey: { type: "secret_ref", secretId: "secret-front-bot" },
  chiefTask: "task-chief",
};

const agentNames = ["Chief", "Liam", "Julian", "Leo"];

/** A harness: the bot, its fake host, and everything it sent, logged, counted and posted. */
export function frontBotHarness(options: HarnessOptions = {}) {
  const { metrics, written } = fakeMetrics();
  const { state, saved } = fakeState();
  if (options.memory !== undefined) {
    // The fake state saves at once; the bot reads it only after the test awaits its event.
    void writeMemory(state, companyId, chatTaskId, boardUserId, options.memory);
  }
  const agents = agentNames.map((name) => ({ id: `agent-${name.toLowerCase()}`, name }));
  const comments: StoredComment[] = [];
  let nextComment = 0;
  const addComment = (
    comment: Omit<StoredComment, "id" | "companyId" | "issueId">,
    issueId = chatTaskId,
  ) => {
    nextComment += 1;
    const stored = { ...comment, id: `comment-${nextComment}`, companyId, issueId };
    comments.push(stored);
    return stored;
  };
  for (const comment of options.earlier ?? []) {
    const agent = agents.find((candidate) => candidate.name === comment.author);
    addComment({
      authorAgentId: agent?.id ?? null,
      authorUserId: agent === undefined ? boardUserId : null,
      body: comment.body,
      createdAt: new Date(comment.at),
    });
  }
  const message = addComment({
    authorAgentId: null,
    authorUserId: boardUserId,
    body: options.message ?? "Is #6129 merged yet?",
    createdAt: new Date("2026-11-26T14:03:00Z"),
  });
  const task = {
    id: chatTaskId,
    companyId,
    identifier: "HAL-10",
    title: options.title ?? "Merge #6129",
    conversationAgentId:
      options.conversationAgentId === undefined ? chiefId : options.conversationAgentId,
    activeRun: { id: "run-1" },
  };
  /** How many of the bot's comments were out when each request was made (HAL-19597). */
  const postedAtRequest: number[] = [];
  const requests: {
    url: string;
    headers: Record<string, string>;
    body: string;
    redirect: RequestInit["redirect"];
  }[] = [];
  const answers = [...(options.answers ?? [])];
  const logs: { level: string; line: string; meta: unknown }[] = [];
  let clock = new Date("2026-11-26T14:03:00.300Z").getTime();
  /** Every read a lookup source made, such as `pr:6129` or `task:HAL-5`. */
  const sourceReads: string[] = [];
  /** Every pause the bot took between lines, in ms; none really waits. */
  const pauses: number[] = [];
  let postsTried = 0;
  const deps: FrontBotDeps & LookupDeps = {
    readPrStatus: async (_company, pr) => {
      sourceReads.push(`pr:${pr}`);
      const recorded = options.pulls?.[pr];
      if (recorded === "hangs") return new Promise<PrStatusResult>(() => {});
      if (recorded === undefined) throw new Error("GitHub: GET answered 404.");
      return recorded;
    },
    now: () => {
      clock += 200;
      return new Date(clock);
    },
    pause: async (ms) => {
      pauses.push(ms);
      clock += ms;
      options.onPause?.();
    },
    anthropicFetch: async (url, init) => {
      postedAtRequest.push(
        comments.filter((each) => each.authorUserId === null && each.authorAgentId === null).length,
      );
      requests.push({
        url: String(url),
        headers: (init?.headers ?? {}) as Record<string, string>,
        body: String(init?.body ?? ""),
        redirect: init?.redirect,
      });
      if (options.agentAnswersDuringCall === true) {
        addComment({
          authorAgentId: chiefId,
          authorUserId: null,
          body: "Merged at 14:02.",
          createdAt: new Date(clock),
        });
      }
      const recorded = answers.shift() ?? { status: 500 };
      if ("hangs" in recorded) {
        return new Promise<Response>(() => {});
      }
      if ("throws" in recorded) {
        throw Object.assign(new Error(recorded.throws), { name: recorded.throws });
      }
      if ("status" in recorded) {
        return new Response(`{"error":{"message":"upstream said ${plantedKey}"}}`, {
          status: recorded.status,
        });
      }
      const usage = { input_tokens: 1800, output_tokens: 40 };
      return new Response(
        JSON.stringify({ content: [{ type: "text", text: recorded.reply }], usage }),
      );
    },
  };
  const ctx = {
    metrics,
    state,
    config: {
      get: async () =>
        options.config ??
        (options.memory === undefined ? botOn : { ...botOn, frontBotMemory: true }),
    },
    secrets: { resolve: async () => plantedKey },
    logger: {
      info: (line: string, meta?: unknown) => logs.push({ level: "info", line, meta }),
      error: (line: string, meta?: unknown) => logs.push({ level: "error", line, meta }),
    },
    agents: { list: async () => agents },
    issues: {
      get: async (id: string, company: string) => {
        if (id === task.id) return company === task.companyId ? task : null;
        sourceReads.push(`task:${id}`);
        const other = options.tasks?.find((each) => each.identifier === id);
        return other === undefined ? null : { id: `id-${id}`, companyId, ...other };
      },
      listComments: async (issueId: string) =>
        comments.filter((comment) => comment.issueId === issueId),
      createComment: async (issueId: string, body: string) => {
        postsTried += 1;
        if (options.postFailsFrom !== undefined && postsTried >= options.postFailsFrom) {
          throw new Error("Host refused the comment.");
        }
        return addComment(
          { authorAgentId: null, authorUserId: null, body, createdAt: new Date(clock) },
          issueId,
        );
      },
    },
  };
  const bot = frontBot(ctx as unknown as Parameters<typeof frontBot>[0], deps);
  const posted = () =>
    comments.filter((comment) => comment.authorUserId === null && comment.authorAgentId === null);
  return {
    bot,
    ctx,
    saved,
    written,
    logs,
    requests,
    postedAtRequest,
    sourceReads,
    pauses,
    comments,
    message,
    task,
    addComment,
    posted,
  };
}

/** The `issue.comment.created` event for a comment on the chat task. */
export function commentCreated(
  commentId: string,
  company = companyId,
  taskId = chatTaskId,
): PluginEvent {
  return {
    eventId: `event-${commentId}`,
    eventType: "issue.comment.created",
    occurredAt: "2026-11-26T14:03:00.250Z",
    companyId: company,
    entityId: taskId,
    entityType: "issue",
    payload: { issueId: taskId, commentId },
  } as PluginEvent;
}
