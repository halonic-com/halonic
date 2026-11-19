import { sandboxStartWords } from "@halonicjs/app";
import type { RunEvent } from "@halonicjs/events";
import { usePresentation } from "@halonicjs/studio-kit";
import { useCallback, useSyncExternalStore } from "react";
import type { SourcedRun } from "../api.ts";
import { runPageWords } from "../run-words.ts";
import type { RunsList } from "../runs-list.ts";
import { useRunLog } from "./every-step.tsx";
import { causeBanner } from "./failure-banner.ts";
import { pageContext } from "./page-context.ts";
import { runBanner } from "./run-page-model.ts";
import { sandboxNotReadyAgent, sandboxNotReadyReason } from "./sandbox-not-ready-banner.tsx";

/** How a run ended, for a screen that waits on it: it failed, with the run page's words, or it finished. */
export type RunEnd =
  | {
      readonly kind: "failed";
      /** The run page's failed banner as one line: "Halonic couldn't reach Ollama … then run again." */
      readonly line: string;
      /** The run's hub; with its id it opens the run's page. */
      readonly hubId: string;
    }
  | { readonly kind: "finished" };

/**
 * How the run with this id ended, from the Runs list: `undefined` while it runs or waits, and
 * while the list doesn't hold it yet. A failed run waits for its log, which the banner's words
 * read (which model, which agent), so its line is said once and doesn't change; a log that can't
 * be read gives the general line. `runId` `undefined` watches nothing.
 */
export function useRunEnd(
  list: RunsList | undefined,
  runId: string | undefined,
): RunEnd | undefined {
  const phone = usePresentation() === "phone";
  const subscribe = useCallback(
    (listener: () => void) => list?.subscribe(listener) ?? (() => {}),
    [list],
  );
  const state = useSyncExternalStore(subscribe, () => list?.state);
  const run = state?.runs.find((candidate) => candidate.summary.id === runId);
  // Only a failed run's log is read; until then nothing is, under no run id, so no events
  // read before the failure stand in for the failed run's own.
  const failed = run?.summary.status === "failed" && list !== undefined;
  const failedLog = useRunLog(
    failed ? list.source : noLog,
    failed && runId !== undefined ? runId : "",
    run?.summary.lastSeq ?? 0,
    state,
  );
  if (list === undefined || run === undefined) return undefined;
  switch (run.summary.status) {
    case "running":
    case "waiting":
      return undefined;
    case "completed":
    case "cant-try":
      return { kind: "finished" };
    case "failed":
      if (failedLog.events === undefined && failedLog.failure === undefined) return undefined;
      return {
        kind: "failed",
        line: runFailureLine(list, run, failedLog.events, phone),
        hubId: run.summary.hubId,
      };
  }
}

/** Stands in for the source until the run has failed. */
const noLog = { log: async (): Promise<RunEvent[]> => [] };

/**
 * The words of a failed run's banner on its page, as one line: the sandbox's refusal, the
 * banner for its cause, else the general "… failed" line. The instructions refusal and a blocked
 * site have banners of their own with buttons; outside the page they get the general line.
 */
export function runFailureLine(
  list: RunsList,
  run: SourcedRun,
  log: readonly RunEvent[] | undefined,
  phone: boolean,
): string {
  const context = pageContext(list, list.state.runs, run, new Date());
  const sandboxReason = sandboxNotReadyReason(run.summary, log);
  if (sandboxReason !== undefined) {
    const words = sandboxStartWords(sandboxReason);
    const name = sandboxNotReadyAgent(log) ?? context.workflow?.name ?? run.summary.workflowId;
    return [
      runPageWords.sandboxNotReady(name),
      words.reason,
      phone ? words.phoneFix : words.calloutFix,
      runPageWords.sandboxNothingRan,
    ].join(" ");
  }
  const banner = causeBanner(run.summary, log, context, phone) ?? runBanner(run, context);
  if (banner === undefined) return "";
  return banner.kind === "note" ? banner.text : banner.lines.join(" ");
}
