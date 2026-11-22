import type { RoutineListing, RoutineTarget, RoutineView } from "./api.ts";

/**
 * The words for a routine that can't start (HAL-15082). Its row, its Starts card and Run now's toast
 * give the same sentence, and "Can't start" is the word `halonic routines` uses too.
 */
export const cantStartWords = {
  chip: "Can't start",
  /** What it starts isn't in the workspace: never there, renamed or removed. */
  targetMissing: (target: string, kind: RoutineTarget["kind"]) =>
    `${target} isn't in this workspace. Pick another ${kind}.`,
  /** Run now's toast: the same sentence, opened as Run now's other refusals are. */
  refused: (reason: string) => `Not started: ${reason}`,
} as const;

/** The routine facts that decide whether it can start. */
export type StartFacts = Pick<
  RoutineListing,
  "targetFound" | "targetName" | "targetKind" | "problems"
>;

/**
 * Why the routine can't start, or `undefined` when it can. A missing workflow or agent comes first,
 * because picking another one is the fix; otherwise the first error the workspace's checks found in
 * its file, as `halonic validate` gives it, since `halonic routines` counts any of them as can't
 * start.
 */
export function cantStartReason(facts: StartFacts): string | undefined {
  if (!facts.targetFound) return cantStartWords.targetMissing(facts.targetName, facts.targetKind);
  return facts.problems[0];
}

/**
 * The same facts read from the routine's page, so its Starts card says what its row says
 * (HAL-15300). A workflow or agent that isn't there is named by its id, as the row names it.
 */
export function pageStartFacts(
  routine: Pick<RoutineView, "target" | "targetState" | "problems">,
): StartFacts {
  return {
    targetFound: routine.targetState !== "not-found",
    targetName: routine.target.id,
    targetKind: routine.target.kind,
    problems: routine.problems,
  };
}

/** {@link cantStartReason} for a routine as its page reads it, so its Runs view agrees with its row. */
export function viewCantStartReason(routine: RoutineView): string | undefined {
  return cantStartReason({
    targetFound: routine.targetState !== "not-found",
    targetName: routine.targetName,
    targetKind: routine.target.kind,
    problems: routine.startErrors ?? [],
  });
}
