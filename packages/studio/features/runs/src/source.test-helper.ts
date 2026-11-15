import type { RunEvent, RunSummary } from "@halonicjs/events";
import type { RunRoutine, RunsSource, RunWorkflow } from "./api.ts";

const supportReply: RunWorkflow = { name: "Support reply", stepDescription: () => undefined };
const morningBrief: RunRoutine = { name: "Morning brief", schedule: "Weekdays at 08:00" };

/**
 * A source whose runs, logs and failures a test sets; every run is in
 * Support reply, made no tool call and costs euros. A run without a log
 * in `initialLogs` has an empty one. Its one routine is
 * `acme/morning-brief`, Morning brief, on weekdays at 08:00.
 */
export function fakeSource(
  initial: readonly RunSummary[],
  initialLogs: Readonly<Record<string, readonly RunEvent[]>> = {},
) {
  let summaries = initial;
  let logs = initialLogs;
  let failure: unknown;
  let monthly: number | undefined;
  let logFailure: unknown;
  let workflowNames: readonly string[] | Error = ["support-reply"];
  const listeners = new Set<() => void>();
  const source: RunsSource = {
    list: async () => {
      if (failure !== undefined) throw failure;
      return summaries.map((summary) => ({ summary, madeToolCalls: false }));
    },
    log: async (runId) => {
      if (failure !== undefined) throw failure;
      if (logFailure !== undefined) throw logFailure;
      return [...(logs[runId] ?? [])];
    },
    workflow: () => supportReply,
    routine: (key) => (key === "acme/morning-brief" ? morningBrief : undefined),
    runnableWorkflows: async () => {
      if (workflowNames instanceof Error) throw workflowNames;
      return workflowNames;
    },
    currency: () => "EUR",
    monthlyBudget: () => monthly,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    source,
    /** Sets the names `halonic run` takes for the workspace's workflows, or makes reading them fail. */
    workflows: (names: readonly string[] | Error) => {
      workflowNames = names;
    },
    /** Sets the workspace's monthly budget, or clears it. */
    budget: (limit: number | undefined) => {
      monthly = limit;
    },
    fail: (error: unknown) => {
      failure = error;
    },
    /** Fails only `log`, while `list` keeps answering. */
    failLog: (error: unknown) => {
      logFailure = error;
    },
    answer: () => {
      failure = undefined;
      logFailure = undefined;
    },
    change: (
      next: readonly RunSummary[],
      nextLogs: Readonly<Record<string, readonly RunEvent[]>> = logs,
    ) => {
      summaries = next;
      logs = nextLogs;
      for (const listener of listeners) listener();
    },
  };
}
