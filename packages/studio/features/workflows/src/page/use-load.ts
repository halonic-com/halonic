import { errorKindOf } from "@halonicjs/std";
import { useCallback, useEffect, useRef, useState } from "react";
import { failureReason } from "../list/list-words.ts";

/** After this long without the answer, the skeleton shows; a faster answer never flashes one (D10). */
export const SKELETON_AFTER_MS = 300;
/** After this long, "Still loading" and **Try again** show. */
export const STILL_LOADING_AFTER_MS = 10_000;

/**
 * Whether something has loaded: waiting for it, the reason it didn't, or the value. `gone` marks a
 * failure because the thing isn't there any more, so the screen can show the item-gone state.
 */
export type Load<Value> =
  | { readonly kind: "loading"; readonly skeleton: boolean; readonly slow: boolean }
  | {
      readonly kind: "failed";
      readonly reason: string;
      readonly retrying: boolean;
      readonly gone?: true;
    }
  | { readonly kind: "ready"; readonly value: Value };

/**
 * What one load asks and listens to. Keep it stable between renders (`useMemo`): a new one starts
 * the load over.
 */
export type LoadSource<Value> = {
  readonly fetch: () => Promise<Value>;
  /** Calls `onChange` when the answer may have changed; returns the way to stop. */
  readonly subscribe: (onChange: () => void) => () => void;
};

/**
 * Reads a value, and again when the source says it may have changed. A read after the first keeps
 * the value on screen, so a refresh never shows a skeleton (D1, D10). Only the newest read's answer
 * is used, and a failed read after the first keeps what is shown. **Try again** after a failure
 * keeps the failure on screen with `retrying` true, never a skeleton, and calls `onRetried` when
 * the read works, so the screen can move focus off the button that is gone. **Try again** while
 * "Still loading" shows starts the skeleton and the timers over.
 */
export function useLoad<Value>(
  source: LoadSource<Value>,
  onRetried?: () => void,
): {
  readonly load: Load<Value>;
  readonly retry: () => void;
} {
  const [result, setResult] = useState<
    | Extract<Load<Value>, { readonly kind: "failed" }>
    | { readonly kind: "ready"; readonly value: Value }
    | undefined
  >();
  const [waited, setWaited] = useState({ skeleton: false, slow: false });
  // Counts the starts, so a retry restarts the timers even though `waiting` never went false.
  const [attempt, setAttempt] = useState(0);
  const newestRead = useRef(0);
  const retried = useRef(onRetried);
  retried.current = onRetried;
  // Set by a Try again after a failure, until that read is answered.
  const retryingFailure = useRef(false);

  const read = useCallback(() => {
    const mine = ++newestRead.current;
    source.fetch().then(
      (value) => {
        if (mine !== newestRead.current) return;
        setResult({ kind: "ready", value });
        if (!retryingFailure.current) return;
        retryingFailure.current = false;
        retried.current?.();
      },
      (error: unknown) => {
        if (mine !== newestRead.current) return;
        retryingFailure.current = false;
        // A failed refresh keeps the value on screen, so the person's zoom stays (D9).
        setResult((was) =>
          was?.kind === "ready"
            ? was
            : {
                kind: "failed",
                reason: failureReason(error),
                retrying: false,
                ...(errorKindOf(error) === "not_found" && { gone: true }),
              },
        );
      },
    );
  }, [source]);

  useEffect(() => {
    retryingFailure.current = false;
    setResult(undefined);
    setWaited({ skeleton: false, slow: false });
    setAttempt((was) => was + 1);
    read();
    const unsubscribe = source.subscribe(read);
    return () => {
      unsubscribe();
      newestRead.current += 1;
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
  }, [waiting, attempt]);

  const failed = result?.kind === "failed";
  const retry = useCallback(() => {
    if (failed) {
      retryingFailure.current = true;
      setResult((was) => (was?.kind === "failed" ? { ...was, retrying: true } : was));
    } else {
      setResult(undefined);
      setWaited({ skeleton: false, slow: false });
      setAttempt((was) => was + 1);
    }
    read();
  }, [read, failed]);

  return { load: result ?? { kind: "loading", ...waited }, retry };
}
