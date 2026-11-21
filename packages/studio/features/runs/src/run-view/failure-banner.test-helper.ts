import type { RunEvent, RunSummary } from "@halonicjs/events";
import type { ProviderKind } from "../api.ts";
import { mondayMorning, summaryWith } from "../summary.test-helper.ts";
import type { causeBanner } from "./failure-banner.ts";
import { type RunPageContext, runBanner } from "./run-page-model.ts";

/** What the failure banner tests share: a run page's context, run events and failed runs. */

export const kinds: Record<string, ProviderKind> = { ollama: "local", claude: "cloud" };
/** The `name` each provider's file gives; Ollama's file names none. */
const names: Record<string, string> = { claude: "Claude" };
export const context: RunPageContext = {
  workflow: { name: "Support reply", stepDescription: () => undefined },
  workflowOfRun: () => undefined,
  providerKind: (id) => kinds[id],
  providerName: (id) => names[id],
  currency: "EUR",
  now: mondayMorning,
};

export function event(rest: Record<string, unknown>, seq: number): RunEvent {
  return { runId: "run_a", seq, at: "2026-11-16T08:00:00Z", ...rest } as RunEvent;
}

export const call = (provider: string, model: string) =>
  event({ type: "llm.request", agent: "reporter", provider, model, messages: 1 }, 2);
export const failedEvent = (host?: string) =>
  event({ type: "run.failed", state: "draft", error: "x", ...(host ? { host } : {}) }, 3);

export function failed(reason: RunSummary["reason"], changes: Partial<RunSummary> = {}) {
  return summaryWith({
    status: "failed",
    reason,
    error: "engine text",
    state: "draft",
    ...changes,
  });
}

export const lines = (banner: ReturnType<typeof causeBanner>) =>
  banner?.kind === "callout" ? banner.lines : undefined;

export const budgetPage = (changes: Partial<RunSummary>) =>
  runBanner({ summary: failed("budget", changes) }, context);
