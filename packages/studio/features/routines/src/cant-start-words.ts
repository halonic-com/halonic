import type { RoutineTarget } from "./api.ts";

/**
 * The words for a routine that can't start (HAL-15082). Its row, its Starts card and Run now's toast
 * give the same sentence, and "Can't start" is the word `halonic routines` uses too. Other features
 * read them through `api.ts`, as the agent map's routine card does (HAL-15646).
 */
export const cantStartWords = {
  chip: "Can't start",
  /** What it starts isn't in the workspace: never there, renamed or removed. */
  targetMissing: (target: string, kind: RoutineTarget["kind"]) =>
    `${target} isn't in this workspace. Pick another ${kind}.`,
  /** Run now's toast: the same sentence, opened as Run now's other refusals are. */
  refused: (reason: string) => `Not started: ${reason}`,
} as const;
