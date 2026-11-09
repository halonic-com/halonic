/**
 * What a routine does with a due time while one of its runs is still going,
 * as the `overlap` setting of a routine file says:
 * - `skip`: drop it
 * - `queue`: keep it, and start it on a later tick once the routine is free
 * - `allow`: start it anyway, next to the run that is going
 */
export type RoutineOverlap = "skip" | "queue" | "allow";

/** The most due times one routine keeps queued; later ones are skipped. */
export const MAX_QUEUED = 100;

/** What to do with each of a routine's waiting due times on one tick. */
export interface OverlapDecision<Run> {
  start: Run[];
  queue: Run[];
  skip: Run[];
}

/**
 * Applies a routine's overlap rule to its waiting due times: those queued on
 * earlier ticks first, then the new ones, oldest first. A run started now
 * makes the routine busy, so unless it allows overlap, a routine starts at
 * most one run per tick, as in the old `dueRoutines`.
 *
 * @param busy - whether a run of the routine is running or waiting
 */
export function applyOverlap<Run>(
  overlap: RoutineOverlap,
  busy: boolean,
  waiting: readonly Run[],
): OverlapDecision<Run> {
  if (overlap === "allow") {
    return { start: [...waiting], queue: [], skip: [] };
  }
  const start = busy ? [] : waiting.slice(0, 1);
  const rest = waiting.slice(start.length);
  if (overlap === "skip") {
    return { start, queue: [], skip: rest };
  }
  return { start, queue: rest.slice(0, MAX_QUEUED), skip: rest.slice(MAX_QUEUED) };
}
