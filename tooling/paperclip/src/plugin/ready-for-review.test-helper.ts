import type { ToolResult, ToolRunContext } from "@paperclipai/plugin-sdk";
import { fakeMetrics, fakeState } from "./fake-host.test-helper.ts";
import { type PrecheckWaitsApi, precheckWaits } from "./precheck-waits.ts";
import {
  type ReadyForReviewApi,
  type ReadyForReviewDeps,
  registerReadyForReview,
} from "./ready-for-review.ts";

/** The calling agent's run in every `ready_for_review` test. */
export const runCtx: ToolRunContext = {
  agentId: "agent-mateo",
  runId: "run-1",
  companyId: "acme",
  projectId: "",
};
export const branch = "mateo/HAL-1-acme-widget";
export const sha = "a".repeat(40);
export const checkId = "3f9c0a1b2c4d";

/** HAL-1, held by the calling agent: the task its branch names. */
export const heldTask = { id: "task-1", identifier: "HAL-1", assigneeAgentId: "agent-mateo" };

type Handler = (params: unknown, runCtx: ToolRunContext) => Promise<ToolResult>;
/** One answer of the fake service, or the error its request throws. */
export type Answer = { status: number; body?: unknown } | Error;

export const queued = { status: 202, body: { id: checkId, status: "queued" } };
export const running = { status: 200, body: { id: checkId, status: "running" } };
export const passed = {
  status: 200,
  body: { id: checkId, status: "done", pass: true, failed: [], durationS: 176 },
};

interface FakeTask {
  id: string;
  identifier: string;
  assigneeAgentId: string | null;
}

/**
 * A precheck service that gives `answers` in order, a clock that only moves
 * when the tool sleeps or a test calls `advance`, so no test waits for real
 * time, and the tasks the plugin may read, comment on and wake.
 */
export function fakePrecheck(
  answers: Answer[],
  options: { config?: Record<string, unknown>; tasks?: FakeTask[] } = {},
) {
  const sent: { method: string; url: string; body?: unknown }[] = [];
  let clock = 0;
  const deps: ReadyForReviewDeps = {
    fetch: async (input, init) => {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      sent.push({ method: init?.method ?? "GET", url: String(input), body });
      const answer = answers.shift();
      if (answer === undefined) throw new Error("no answer left");
      if (answer instanceof Error) throw answer;
      return new Response(JSON.stringify(answer.body ?? {}), { status: answer.status });
    },
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => clock,
  };
  const tasks = options.tasks ?? [];
  const comments: { taskId: string; body: string }[] = [];
  const wakes: { taskId: string; key: string | null | undefined }[] = [];
  const logs: string[] = [];
  const handlers = new Map<string, Handler>();
  const { metrics: client, written: metrics } = fakeMetrics();
  const ctx = {
    metrics: client,
    tools: {
      register: (name: string, _declaration: unknown, fn: Handler) => handlers.set(name, fn),
    },
    config: { get: async () => options.config ?? {} },
    state: fakeState().state,
    issues: {
      get: async (task: string) =>
        tasks.find((one) => one.id === task || one.identifier === task) ?? null,
      createComment: async (taskId: string, body: string) => {
        comments.push({ taskId, body });
      },
      requestWakeup: async (
        taskId: string,
        _companyId: string,
        wake?: { idempotencyKey?: string | null },
      ) => {
        wakes.push({ taskId, key: wake?.idempotencyKey });
      },
    },
    logger: {
      info: (message: string) => logs.push(message),
      error: (message: string) => logs.push(message),
    },
  };
  const waits = precheckWaits(ctx as unknown as PrecheckWaitsApi, deps);
  registerReadyForReview(ctx as unknown as ReadyForReviewApi, waits, deps);
  const call = (params: unknown) => {
    const handler = handlers.get("ready_for_review");
    if (handler === undefined) throw new Error("ready_for_review isn't registered");
    return handler(params, runCtx);
  };
  return {
    call,
    sent,
    metrics,
    comments,
    wakes,
    logs,
    tasks,
    /** The host's task calls, so a test can make one fail. */
    issues: ctx.issues,
    /** Runs the `precheck-wake` job's pass for the test company. */
    pass: () => waits.pass(runCtx.companyId),
    /** Queues more answers of the service. */
    answer: (...more: Answer[]) => answers.push(...more),
    advance: (ms: number) => {
      clock += ms;
    },
  };
}
