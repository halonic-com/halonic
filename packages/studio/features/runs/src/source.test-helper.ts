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
  let logFailure: unknown;
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
    currency: () => "EUR",
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    source,
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
