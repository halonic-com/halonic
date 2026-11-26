import type { InboxWaitContext } from "@halonicjs/studio-feature-inbox/api";

/**
 * By run id, what the waiting list's `context` says about each run (`studio.served-wait-context`),
 * or `undefined` when it isn't an object. An entry that can't be read is left out, and so is a
 * field of the wrong type, so one odd run never fails the list. A Map, so an id such as
 * `constructor` is only a key.
 */
export function waitContextsOf(value: unknown): ReadonlyMap<string, InboxWaitContext> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return new Map(
    Object.entries(value).flatMap(([runId, entry]) => {
      const context = contextOf(entry);
      return context === undefined ? [] : [[runId, context] as const];
    }),
  );
}

function contextOf(entry: unknown): InboxWaitContext | undefined {
  if (typeof entry !== "object" || entry === null) return undefined;
  const { workflow, description, startInput, sample } = entry as Record<string, unknown>;
  if (typeof workflow !== "string" || workflow === "") return undefined;
  return {
    workflow,
    sample: sample === true,
    ...(typeof description === "string" ? { description } : {}),
    ...(typeof startInput === "string" && startInput !== "" ? { startInput } : {}),
  };
}

/** How many runs' contexts are kept: a list holds at most 100, and an answered card needs its run's. */
const keptContexts = 200;

/**
 * Adds the newest list's contexts to `kept`, replacing a run's older one, and drops the oldest past
 * {@link keptContexts}. A run that left the list keeps its context, so its card still says what
 * was answered after **Approve**.
 */
export function keepNewest(
  kept: Map<string, InboxWaitContext>,
  newest: ReadonlyMap<string, InboxWaitContext>,
): void {
  for (const [runId, context] of newest) {
    // Deleted first, so a run listed again counts as new and isn't the first to go.
    kept.delete(runId);
    kept.set(runId, context);
  }
  for (const runId of kept.keys()) {
    if (kept.size <= keptContexts) break;
    kept.delete(runId);
  }
}
