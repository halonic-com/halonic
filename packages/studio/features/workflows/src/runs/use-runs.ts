import type { RunsSource, SourcedRun } from "@halonicjs/studio-feature-runs/api";
import { useMemo } from "react";
import { useLoad } from "../page/use-load.ts";

/** Whether the runs have loaded once: waiting for them, why not, or the runs. */
export type RunsLoad =
  | { readonly kind: "loading"; readonly skeleton: boolean; readonly slow: boolean }
  | { readonly kind: "failed"; readonly reason: string }
  | { readonly kind: "ready"; readonly runs: readonly SourcedRun[] };

/**
 * Reads every run from the source, and again whenever it says a run started, changed or ended. Rows
 * update in place: a read after the first never shows a skeleton and a failed one keeps the rows
 * (R11). Only the newest read's answer counts.
 */
export function useRuns(source: RunsSource): { load: RunsLoad; retry: () => void } {
  const loadSource = useMemo(
    () => ({
      fetch: () => source.list(),
      subscribe: (onChange: () => void) => source.subscribe(onChange),
    }),
    [source],
  );
  const { load, retry } = useLoad(loadSource);
  return { load: load.kind === "ready" ? { kind: "ready", runs: load.value } : load, retry };
}
