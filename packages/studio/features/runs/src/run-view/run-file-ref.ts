import type { ItemRef } from "@halonicjs/studio-shell";

/** The item kind of a file a run saved, opened read-only in its own tab (HAL-17831). */
export const runFileKind = "run-file";

/**
 * The item of a file a run saved: its id is the run's id, then `/`, then the file's name as the
 * log has it. A run id has no `/`, so a name keeps any of its own.
 *
 * @example
 * runFileItem("acme", "run_mfx3k2a1_01jd8q", "weekly-report.md");
 * // { kind: "run-file", hub: "acme", id: "run_mfx3k2a1_01jd8q/weekly-report.md" }
 */
export function runFileItem(hub: string, runId: string, name: string): ItemRef {
  return { kind: runFileKind, hub, id: `${runId}/${name}` };
}

/** The run and the file name a {@link runFileItem}'s id names. */
export function runFileOf(id: string): { readonly runId: string; readonly name: string } {
  const slash = id.indexOf("/");
  return slash === -1
    ? { runId: id, name: "" }
    : { runId: id.slice(0, slash), name: id.slice(slash + 1) };
}
