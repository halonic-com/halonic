import { runPageWords } from "../run-words.ts";
import type { RunBanner } from "./run-page-model.ts";

/** The buttons a failed run's banner may carry around **Run again**. */
export type DangerButtons = Pick<
  Extract<RunBanner, { kind: "callout" }>,
  "fixes" | "links" | "details" | "noRunAgain"
>;

/** A failed run's banner: its lines, and the buttons that mend the cause around **Run again**. */
export function danger(lines: readonly string[], buttons: DangerButtons = {}): RunBanner {
  return { kind: "callout", tone: "danger", name: runPageWords.failedName, lines, ...buttons };
}
