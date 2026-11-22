import type { WorkflowArrow } from "../api.ts";
import { neverTaken } from "./never-taken.ts";
import { pageWords } from "./page-words.ts";
import { type NamedStep, nameOf, stepNames } from "./step-names.ts";

const words = pageWords.arrows;

/**
 * `line` as announced after a change of the arrows, followed by "Arrow 2 is never taken: arrow 1
 * always matches first." when the change left one of the arrows at `places` (from 0) never taken.
 */
export function withNeverTaken(
  line: string,
  arrows: readonly WorkflowArrow[],
  places: readonly number[],
): string {
  const beatenBy = neverTaken(arrows);
  for (const place of places) {
    const earlier = beatenBy[place];
    if (earlier !== undefined) return `${line} ${words.neverTaken(place + 1, earlier)}`;
  }
  return line;
}

/**
 * What is announced once an arrow on done from `from` to `to` is added after the step's other
 * `arrows`: "Arrow added: Start to Done.", with the steps named as their cards name them, and the
 * never-taken sentence when an earlier arrow always beats the new one. The step card's **Add** and
 * a drag between ports on the canvas say the same (C595 row 32).
 */
export function arrowAddedLine(
  steps: readonly NamedStep[],
  arrows: readonly WorkflowArrow[],
  from: string,
  to: string,
): string {
  const names = stepNames(steps);
  const added = [...arrows, { from, to }];
  return withNeverTaken(words.added(nameOf(names, from), nameOf(names, to)), added, [
    arrows.length,
  ]);
}
