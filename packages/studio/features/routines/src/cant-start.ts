import type { RoutineListing, RoutineTarget } from "./api.ts";

/**
 * The words for a routine that can't start (HAL-15082). Its row, its Starts card and Run now's toast
 * give the same sentence, and "Can't start" is the word `halonic routines` uses too.
 */
export const cantStartWords = {
  chip: "Can't start",
  /** What it starts isn't in the workspace: never there, renamed or removed. */
  targetMissing: (target: string, kind: RoutineTarget["kind"]) =>
    `${target} isn't in this workspace. Pick another ${kind}.`,
  /** Run now's toast: the same sentence, after the chip's word. */
  refused: (reason: string) => `Can't start: ${reason}`,
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
