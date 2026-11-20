import type { RunEvent, RunSummary } from "@halonicjs/events";
import type { ProviderKind, RunnableWorkflow, RunRoutine, RunsSource, RunWorkflow } from "./api.ts";

const supportReply: RunWorkflow = { name: "Support reply", stepDescription: () => undefined };

/** A workflow in the `acme` hub as the empty lines name it: `halonic run` takes its id. */
export function runnable(id: string, name: string): RunnableWorkflow {
  return { hubId: "acme", id, name, command: id };
}
const providerKinds: Readonly<Record<string, ProviderKind>> = {
  mock: "local",
  ollama: "local",
  claude: "cloud",
};
const morningBrief: RunRoutine = { name: "Morning brief", schedule: "Weekdays at 08:00" };

/**
 * A source whose runs, logs and failures a test sets; every run is in
 * Support reply, made no tool call and costs euros. A run without a log
 * in `initialLogs` has an empty one. Its one hub is `acme`, named Acme. Its providers are `mock` and `ollama` (local) and `claude` (cloud). Its one routine is
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
  let workflows: readonly RunnableWorkflow[] | Error = [runnable("support-reply", "Support reply")];
  const listeners = new Set<() => void>();
  const source: RunsSource = {
    list: async () => {
      if (failure !== undefined) throw failure;
      return summaries.map((summary) => ({ summary }));
    },
    log: async (runId) => {
      if (failure !== undefined) throw failure;
      if (logFailure !== undefined) throw logFailure;
      return [...(logs[runId] ?? [])];
    },
    workflow: () => supportReply,
    hubName: (hubId) => (hubId === "acme" ? "Acme" : undefined),
    routine: (key) => (key === "acme/morning-brief" ? morningBrief : undefined),
    runnableWorkflows: async () => {
      if (workflows instanceof Error) throw workflows;
      return workflows;
    },
    providerKind: (id) => providerKinds[id],
    currency: () => "EUR",
    monthlyBudget: () => monthly,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    source,
    /** Sets the workspace's workflows, or makes reading them fail. */
    workflows: (next: readonly RunnableWorkflow[] | Error) => {
      workflows = next;
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
