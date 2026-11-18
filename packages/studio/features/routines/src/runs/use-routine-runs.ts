import { useCallback, useEffect, useState } from "react";
import type { RoutineRuns, RoutinesHost, RoutineView } from "../api.ts";
import { failureReason } from "../page/page-words.ts";

/** What the Runs view has of the routine's runs. */
export type RoutineRunsLoad =
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly reason: string; readonly retrying: boolean }
  | { readonly kind: "ready"; readonly runs: RoutineRuns };

/**
 * Reads the routine's runs, skipped times and queued times from the host, and again each time
 * `routine` is a new read of the routine; before it is read nothing is asked (the host tells the page about every run that starts or
 * ends). A read after the first keeps what is shown, so a refresh never blanks the view, and a
 * failed refresh keeps it too.
 */
export function useRoutineRuns(
  host: RoutinesHost,
  routine: RoutineView | undefined,
): { readonly load: RoutineRunsLoad; readonly retry: () => void } {
  const [load, setLoad] = useState<RoutineRunsLoad>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const hubId = routine?.hubId;
  const id = routine?.id;

  useEffect(() => {
    if (hubId === undefined || id === undefined) return;
    let current = true;
    host.runs({ hubId, id }).then(
      (runs) => current && setLoad({ kind: "ready", runs }),
      (error: unknown) =>
        current &&
        setLoad((was) =>
          was.kind === "ready"
            ? was
            : { kind: "failed", reason: failureReason(error), retrying: false },
        ),
    );
    return () => {
      current = false;
    };
  }, [host, hubId, id, routine, attempt]);

  const retry = useCallback(() => {
    setLoad((was) => (was.kind === "failed" ? { ...was, retrying: true } : was));
    setAttempt((was) => was + 1);
  }, []);
  return { load, retry };
}
