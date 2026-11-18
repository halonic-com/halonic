import { useCallback, useEffect, useState } from "react";
import type { RoutinesHost, TriggerOwner, TriggerRow } from "../api.ts";
import { failureReason } from "../page/page-words.ts";

/** What the Triggers section has of the routines that start its owner. */
export type TriggerRowsLoad =
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly reason: string; readonly retrying: boolean }
  | { readonly kind: "ready"; readonly rows: readonly TriggerRow[] };

/**
 * Reads the routines that start `owner`, and again each time the host says the routines may have
 * changed. A read after the first keeps what is shown, so a refresh never blanks the section.
 */
export function useTriggerRows(
  host: RoutinesHost,
  owner: TriggerOwner,
): { readonly load: TriggerRowsLoad; readonly retry: () => void } {
  const [load, setLoad] = useState<TriggerRowsLoad>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const { kind, hubId, id } = owner;

  // A new owner is a new read from the start.
  useEffect(() => {
    setLoad({ kind: "loading" });
  }, [kind, hubId, id]);

  useEffect(() => {
    let current = true;
    const read = () =>
      host.startingRoutines({ kind, hubId, id }).then(
        (rows) => current && setLoad({ kind: "ready", rows }),
        (error: unknown) =>
          current &&
          setLoad((was) =>
            was.kind === "ready"
              ? was
              : { kind: "failed", reason: failureReason(error), retrying: false },
          ),
      );
    read();
    const stop = host.subscribe(read);
    return () => {
      current = false;
      stop();
    };
  }, [host, kind, hubId, id, attempt]);

  const retry = useCallback(() => {
    setLoad((was) => (was.kind === "failed" ? { ...was, retrying: true } : was));
    setAttempt((was) => was + 1);
  }, []);
  return { load, retry };
}
