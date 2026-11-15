import { useMemo, useRef } from "react";
import type { WorkflowRef, WorkflowsHost, WorkflowView } from "../api.ts";
import { type Load, useLoad } from "./use-load.ts";

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
  const fetchRef = useRef(fetch);
  fetchRef.current = fetch;
  const { hubId, id } = ref;
  const source = useMemo(
    () => ({
      fetch: () => fetchRef.current(host, { hubId, id }),
      subscribe: (onChange: () => void) => host.subscribe(onChange),
    }),
    [host, hubId, id],
  );
  return useLoad(source);
}
