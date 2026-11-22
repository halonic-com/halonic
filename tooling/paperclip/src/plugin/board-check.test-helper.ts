import { JsonRpcCallError, PLUGIN_RPC_ERROR_CODES } from "@paperclipai/plugin-sdk";
import type { BoardCheckApi } from "./board-check-api.ts";

/** A task as the fake host stores it: only the fields the board check reads. */
export interface FakeTask {
  readonly id: string;
  readonly identifier: string;
  readonly status: string;
  readonly assigneeAgentId: string | null;
  readonly assigneeUserId?: string | null;
  readonly updatedAt: Date;
  readonly blockedTransitionAt?: Date | null;
  readonly reviewAttention?: { paths: { kind: string; since: string | null }[] };
  /** The ids of the tasks this one blocks, as Paperclip's blocker links say. */
  readonly blocks?: readonly string[];
  /** Pending board cards, for a task listed without review attention. */
  readonly pendingCards?: number;
}

/** A comment as the fake host stores it. */
export interface FakeTaskComment {
  readonly id: string;
  readonly authorType: "agent" | "user" | "system";
  readonly authorAgentId: string | null;
  readonly createdAt: Date;
  readonly body: string;
  readonly origin?: "comment" | "fast_response";
}

/** The agents of company acme; the Board Checker holds `task-checker`. */
export const agents = [
  { id: "agent-checker", name: "Board Checker", urlKey: "board-checker" },
  { id: "agent-merger", name: "Merger", urlKey: "merger" },
  { id: "agent-mateo", name: "Mateo", urlKey: "mateo" },
  { id: "agent-priya", name: "Priya", urlKey: "priya" },
];

export const checkerTask: FakeTask = {
  id: "task-checker",
  identifier: "HAL-16118",
  status: "in_progress",
  assigneeAgentId: "agent-checker",
  updatedAt: new Date("2026-11-22T09:00:00Z"),
};

/**
 * Wraps `target` so that reading any property not in `allowed` throws. The
 * board check gets its plugin context through this, so a test fails the
 * moment it reaches for a call outside its allowlist.
 */
function only<T extends object>(target: T, path: string, allowed: readonly string[]): T {
  return new Proxy(target, {
    get(object, property, receiver) {
      if (typeof property === "string" && !allowed.includes(property)) {
        throw new Error(`The board check touched ${path}.${property}.`);
      }
      return Reflect.get(object, property, receiver);
    },
  });
}

/** The issues client: tasks and comments from `options`, each write recorded in `sent`. */
function fakeIssues(
  options: {
    tasks: readonly FakeTask[];
    comments: Record<string, readonly FakeTaskComment[]>;
    commentsError?: Error;
  },
  sent: { call: string; args: unknown[] }[],
) {
  const record =
    (call: string) =>
    async (...args: unknown[]) => {
      sent.push({ call, args });
      return {};
    };
  const issues = {
    list: async (input: { status: string; offset: number; limit: number }) =>
      options.tasks
        .filter((task) => task.status === input.status)
        .slice(input.offset, input.offset + input.limit),
    get: async (id: string) => options.tasks.find((task) => task.id === id) ?? null,
    listInteractions: async (id: string) =>
      Array.from(
        { length: options.tasks.find((task) => task.id === id)?.pendingCards ?? 0 },
        () => ({ status: "pending" }),
      ),
    relations: only(
      {
        get: async (id: string) => ({
          blockedBy: [],
          blocks: (options.tasks.find((task) => task.id === id)?.blocks ?? []).flatMap((blocked) =>
            options.tasks.filter((task) => task.id === blocked),
          ),
        }),
      },
      "issues.relations",
      ["get"],
    ),
    listComments: async (id: string) => {
      if (options.commentsError !== undefined) {
        throw options.commentsError;
      }
      return options.comments[id] ?? [];
    },
    createComment: record("createComment"),
    requestWakeup: record("requestWakeup"),
    documents: only({ upsert: record("documents.upsert") }, "issues.documents", ["upsert"]),
  };
  return issues;
}

/**
 * A plugin context for company acme with tasks, comments and agents in
 * memory. It records every write, log line, metric and saved state, and
 * offers only the calls the board check may make.
 */
export function fakeBoardContext(options: {
  tasks: readonly FakeTask[];
  comments: Record<string, readonly FakeTaskComment[]>;
  config: () => Record<string, unknown> | undefined;
  commentsError?: Error;
}) {
  const sent: { call: string; args: unknown[] }[] = [];
  const logs: { level: string; message: string; meta: unknown }[] = [];
  const metrics: { name: string; value: number; tags: unknown }[] = [];
  const state = new Map<string, unknown>();
  const issues = fakeIssues(options, sent);
  const ctx = {
    issues: only(issues, "issues", [
      "list",
      "get",
      "listComments",
      "listInteractions",
      "relations",
      "createComment",
      "requestWakeup",
      "documents",
    ]),
    agents: only({ list: async () => agents }, "agents", ["list"]),
    state: only(
      {
        get: async (key: { stateKey: string }) => state.get(key.stateKey) ?? null,
        set: async (key: { stateKey: string }, value: unknown) => {
          state.set(key.stateKey, value);
        },
      },
      "state",
      ["get", "set"],
    ),
    config: {
      get: async () => {
        const config = options.config();
        if (config === undefined) {
          throw new JsonRpcCallError({
            code: PLUGIN_RPC_ERROR_CODES.INVOCATION_SCOPE_DENIED,
            message: "company context is required",
          });
        }
        return config;
      },
    },
    companies: { list: async () => [{ id: "acme" }] },
    logger: {
      info: (message: string, meta?: unknown) => logs.push({ level: "info", message, meta }),
      error: (message: string, meta?: unknown) => logs.push({ level: "error", message, meta }),
    },
    metrics: {
      write: async (name: string, value: number, tags?: unknown) => {
        metrics.push({ name, value, tags });
      },
    },
  };
  const guarded = only(ctx, "ctx", [
    "issues",
    "agents",
    "state",
    "config",
    "companies",
    "logger",
    "metrics",
  ]);
  return { ctx: guarded as unknown as BoardCheckApi, sent, logs, metrics, state };
}
