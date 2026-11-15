import type { RunsSource, SourcedRun } from "@halonicjs/studio-feature-runs/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { failureReason } from "../list/list-words.ts";
import { SKELETON_AFTER_MS, STILL_LOADING_AFTER_MS } from "../page/use-workflow.ts";

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
  const [result, setResult] = useState<
    { kind: "failed"; reason: string } | { kind: "ready"; runs: readonly SourcedRun[] } | undefined
  >();
  const [waited, setWaited] = useState({ skeleton: false, slow: false });
  const newest = useRef(0);

  const read = useCallback(() => {
    const mine = ++newest.current;
    source.list().then(
      (runs) => {
        if (mine === newest.current) setResult({ kind: "ready", runs });
      },
      (error: unknown) => {
        if (mine === newest.current)
          setResult((was) =>
            was?.kind === "ready" ? was : { kind: "failed", reason: failureReason(error) },
          );
      },
    );
  }, [source]);

  useEffect(() => {
    setResult(undefined);
    setWaited({ skeleton: false, slow: false });
    read();
    const stop = source.subscribe(read);
    return () => {
      stop();
      newest.current += 1;
    };
  }, [source, read]);

  const waiting = result === undefined;
  useEffect(() => {
    if (!waiting) return;
    const skeleton = setTimeout(
      () => setWaited((was) => ({ ...was, skeleton: true })),
      SKELETON_AFTER_MS,
    );
    const slow = setTimeout(
      () => setWaited((was) => ({ ...was, slow: true })),
      STILL_LOADING_AFTER_MS,
    );
    return () => {
      clearTimeout(skeleton);
      clearTimeout(slow);
    };
  }, [waiting]);

  const retry = useCallback(() => {
    setResult(undefined);
    setWaited({ skeleton: false, slow: false });
    read();
  }, [read]);

  return { load: result ?? { kind: "loading", ...waited }, retry };
}
