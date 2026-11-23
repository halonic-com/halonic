import type { TaggerAnswer } from "./prompt.ts";

/**
 * Which difficulty labels a task gets, and whether the tagger may touch them
 * (HAL-16901, requirement `paperclip.difficulty-tagger`). Pure.
 *
 * The tagger owns a task's difficulty labels only while they are exactly the
 * ones it wrote last (or there are none and it never wrote any). A label that
 * a person or Chief added, or one of the tagger's that someone took off,
 * hands the task's labels over to people for good: the tagger never writes
 * them again.
 */

/** The labels the tagger writes. Owen's effort table reads the same names (src/task-effort/rules.ts). */
export const difficultyLabels: readonly string[] = ["D1", "D2", "D3", "D4", "opus-only"];

/**
 * Whether a label name is a difficulty label. `D5` counts as one too, so the
 * tagger never writes over a `D5` a person set; case and spaces don't matter,
 * as in the effort table.
 */
export function isDifficultyLabel(name: string): boolean {
  const label = name.trim().toLowerCase();
  return /^d[1-5]$/.test(label) || label === "opus-only";
}

/** The labels for an answer: a `D` label and maybe `opus-only` for code, none for other work. */
export function labelsFor(answer: TaggerAnswer): readonly string[] {
  if (answer.kind !== "code" || answer.difficulty === undefined) {
    return [];
  }
  return answer.opusOnly ? [answer.difficulty, "opus-only"] : [answer.difficulty];
}

/** Whether two lists name the same labels, in any order, case and spaces aside. */
export function sameLabels(a: readonly string[], b: readonly string[]): boolean {
  const left = a.map((name) => name.trim().toLowerCase()).sort();
  const right = b.map((name) => name.trim().toLowerCase()).sort();
  return left.length === right.length && left.every((name, index) => name === right[index]);
}

/**
 * Whether the tagger may set a task's difficulty labels: they are the ones it
 * wrote last, or the task has none and the tagger never wrote any.
 */
export function taggerOwnsLabels(
  labelNames: readonly string[],
  lastWritten: readonly string[] | undefined,
): boolean {
  const current = labelNames.filter(isDifficultyLabel);
  return sameLabels(current, lastWritten ?? []);
}

/** A company label: its id and name. */
export interface CompanyLabel {
  readonly id: string;
  readonly name: string;
}

/**
 * The task's label ids after the tagger's change: every label that isn't a
 * difficulty label stays, and the difficulty labels become `wanted`. Returns
 * the names it couldn't find among the company's labels instead, so a missing
 * label is reported, not skipped.
 */
export function nextLabelIds(
  taskLabels: readonly CompanyLabel[],
  wanted: readonly string[],
  companyLabels: readonly CompanyLabel[],
): { readonly ids: string[] } | { readonly missing: string[] } {
  const kept = taskLabels
    .filter((label) => !isDifficultyLabel(label.name))
    .map((label) => label.id);
  const found = wanted.map((name) => companyLabels.find((label) => label.name === name));
  const missing = wanted.filter((_name, index) => found[index] === undefined);
  if (missing.length > 0) {
    return { missing };
  }
  return { ids: [...kept, ...found.map((label) => (label as CompanyLabel).id)] };
}
