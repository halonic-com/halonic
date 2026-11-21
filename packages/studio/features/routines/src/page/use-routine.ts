import { errorKindOf } from "@halonicjs/std";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RoutineRef, RoutinesHost, RoutineView } from "../api.ts";
import { failureReason } from "./page-words.ts";

/** After this long without the answer, the skeleton shows; a faster answer never flashes one. */
export const SKELETON_AFTER_MS = 300;
/** After this long, "Still loading" and **Try again** show. */
export const STILL_LOADING_AFTER_MS = 10_000;

/**
 * Whether the routine has loaded: waiting (with what the wait shows), why it couldn't be read, or
 * the routine. `gone` marks a routine that isn't in the workspace any more, which **Try again**
 * can't bring back.
 */
export type RoutineLoad =
  | { readonly kind: "loading"; readonly skeleton: boolean; readonly slow: boolean }
  | {
      readonly kind: "failed";
      readonly reason: string;
      readonly retrying: boolean;
      readonly gone: boolean;
    }
  | { readonly kind: "ready"; readonly routine: RoutineView };

type Answer = Exclude<RoutineLoad, { readonly kind: "loading" }>;

/**
 * Reads one routine from the host, and again when the host says something may have changed. A
 * read after the first keeps the routine on screen, so a refresh never shows a skeleton, and a
 * failed refresh keeps what is shown, unless the routine is gone. **Try again** after a failure keeps the failure on screen
 * with `retrying` true and calls `onRetried` once the read works, so the page can move focus off
 * the button that is gone. `readAgain` reads it as a change would, for what changes no file, such
 * as a new version.
 */
export function useRoutine(
  host: RoutinesHost,
  ref: RoutineRef,
  onRetried: () => void,
): { readonly load: RoutineLoad; readonly retry: () => void; readonly readAgain: () => void } {
  const [answer, setAnswer] = useState<Answer | undefined>();
  const [waited, setWaited] = useState({ skeleton: false, slow: false });
  const newestRead = useRef(0);
  const retrying = useRef(false);
  const retried = useRef(onRetried);
  retried.current = onRetried;
  const { hubId, id } = ref;

  const read = useCallback(() => {
    const mine = ++newestRead.current;
    host.read({ hubId, id }).then(
      (routine) => {
        if (mine !== newestRead.current) return;
        setAnswer({ kind: "ready", routine });
        if (!retrying.current) return;
        retrying.current = false;
        retried.current();
      },
      (error: unknown) => {
        if (mine !== newestRead.current) return;
        retrying.current = false;
        const gone = errorKindOf(error) === "not_found";
        // A routine that is gone (moved to the trash here or elsewhere) is not a failed refresh:
        // the page must stop showing it.
        setAnswer((was) =>
          was?.kind === "ready" && !gone
            ? was
            : { kind: "failed", reason: failureReason(error), retrying: false, gone },
        );
      },
    );
  }, [host, hubId, id]);

  useEffect(() => {
    retrying.current = false;
    setAnswer(undefined);
    read();
    const stop = host.subscribe(read);
    return () => {
      stop();
      newestRead.current += 1;
    };
  }, [host, read]);

  const waiting = answer === undefined;
  useEffect(() => {
    if (!waiting) return;
    setWaited({ skeleton: false, slow: false });
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

  const failed = answer?.kind === "failed";
  const retry = useCallback(() => {
    if (failed) {
      retrying.current = true;
      setAnswer((was) => (was?.kind === "failed" ? { ...was, retrying: true } : was));
    } else {
      setAnswer(undefined);
    }
    read();
  }, [read, failed]);

  return { load: answer ?? { kind: "loading", ...waited }, retry, readAgain: read };
}
