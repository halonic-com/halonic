import type { RunSummary } from "@halonicjs/events";
import type { InboxWaitContext } from "@halonicjs/studio-feature-inbox/api";

/** One run's context as the waiting list gives it: the description is of the step it waits at now. */
export interface ListedContext {
  readonly workflow: string;
  readonly description?: string;
  readonly startInput?: string;
  readonly sample: boolean;
}

/**
 * By run id, what the waiting list's `context` says about each run (`studio.served-wait-context`),
 * or `undefined` when it isn't an object. An entry that can't be read is left out, and so is a
 * field of the wrong type, so one odd run never fails the list. A Map, so an id such as
 * `constructor` is only a key.
 */
export function waitContextsOf(value: unknown): ReadonlyMap<string, ListedContext> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return new Map(
    Object.entries(value).flatMap(([runId, entry]) => {
      const context = contextOf(entry);
      return context === undefined ? [] : [[runId, context] as const];
    }),
  );
}

function contextOf(entry: unknown): ListedContext | undefined {
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
 * was answered after **Approve**. Each description is kept by the step `runs` listed the run
 * waiting at, beside the ones its earlier steps had, so an earlier step's card keeps its own.
 */
export function keepNewest(
  kept: Map<string, InboxWaitContext>,
  newest: ReadonlyMap<string, ListedContext>,
  runs: readonly Pick<RunSummary, "id" | "state">[],
): void {
  const stateOf = new Map(runs.map((run) => [run.id, run.state]));
  for (const [runId, { description, ...listed }] of newest) {
    const descriptions = new Map(kept.get(runId)?.descriptions);
    const state = stateOf.get(runId);
    if (description !== undefined && typeof state === "string")
      descriptions.set(state, description);
    // Deleted first, so a run listed again counts as new and isn't the first to go.
    kept.delete(runId);
    kept.set(runId, { ...listed, descriptions });
  }
  for (const runId of kept.keys()) {
    if (kept.size <= keptContexts) break;
    kept.delete(runId);
  }
}
