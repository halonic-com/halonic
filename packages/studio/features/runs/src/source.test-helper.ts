import type { RunSummary } from "@halonicjs/events";
import type { RunsSource, RunWorkflow } from "./api.ts";

const supportReply: RunWorkflow = { name: "Support reply", stepDescription: () => undefined };

/** A source whose runs and failures a test sets; every run is in Support reply, made no tool call and costs euros. */
export function fakeSource(initial: readonly RunSummary[]) {
  let summaries = initial;
  let failure: unknown;
  const listeners = new Set<() => void>();
  const source: RunsSource = {
    list: async () => {
      if (failure !== undefined) throw failure;
      return summaries.map((summary) => ({ summary, madeToolCalls: false }));
    },
    workflow: () => supportReply,
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
    answer: () => {
      failure = undefined;
    },
    change: (next: readonly RunSummary[]) => {
      summaries = next;
      for (const listener of listeners) listener();
    },
  };
}
