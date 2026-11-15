import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkflowRef, WorkflowsHost, WorkflowView } from "../api.ts";
import { failureReason } from "../list/list-words.ts";

/** After this long without the file, the skeleton shows; a faster answer never flashes one (D10). */
export const SKELETON_AFTER_MS = 300;
/** After this long, "Still loading" and **Try again** show. */
export const STILL_LOADING_AFTER_MS = 10_000;

/** Whether the workflow has loaded: waiting for it, the reason it didn't, or the workflow. */
export type Load<Value> =
  | { readonly kind: "loading"; readonly skeleton: boolean; readonly slow: boolean }
  | { readonly kind: "failed"; readonly reason: string }
  | { readonly kind: "ready"; readonly value: Value };

/** The workflow's own load, as the page and the canvas read it. */
export type WorkflowLoad = Load<WorkflowView>;

/**
 * Reads one workflow from the host, and again when the host says something may have changed. A
 * read after the first keeps the workflow on screen, so a refresh never shows a skeleton (D1, D10).
 * Only the newest read's answer is used, and a failed read after the first keeps what is shown.
 */
export function useWorkflow(
  host: WorkflowsHost,
  ref: WorkflowRef,
): { readonly load: WorkflowLoad; readonly retry: () => void } {
  return useHostRead(host, ref, (one, at) => one.read(at));
}

/**
 * The same read for any answer of the host about one workflow: `fetch` asks, and the rules above
 * hold for it (no skeleton under 300 ms, a refresh keeps what is shown).
 */
export function useHostRead<Value>(
  host: WorkflowsHost,
  ref: WorkflowRef,
  fetch: (host: WorkflowsHost, ref: WorkflowRef) => Promise<Value>,
): { readonly load: Load<Value>; readonly retry: () => void } {
  const [result, setResult] = useState<
    | { readonly kind: "failed"; readonly reason: string }
    | { readonly kind: "ready"; readonly value: Value }
    | undefined
  >();
  const fetchRef = useRef(fetch);
  fetchRef.current = fetch;
  const [waited, setWaited] = useState({ skeleton: false, slow: false });
  const newestRead = useRef(0);
  const { hubId, id } = ref;

  const read = useCallback(() => {
    const mine = ++newestRead.current;
    fetchRef.current(host, { hubId, id }).then(
      (value) => {
        if (mine === newestRead.current) setResult({ kind: "ready", value });
      },
      (error: unknown) => {
        // A failed refresh keeps the workflow on screen, so the person's zoom stays (D9).
        if (mine === newestRead.current)
          setResult((was) =>
            was?.kind === "ready" ? was : { kind: "failed", reason: failureReason(error) },
          );
      },
    );
  }, [host, hubId, id]);

  useEffect(() => {
    setResult(undefined);
    setWaited({ skeleton: false, slow: false });
    read();
    const unsubscribe = host.subscribe(read);
    return () => {
      unsubscribe();
      newestRead.current += 1;
    };
  }, [host, read]);

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
