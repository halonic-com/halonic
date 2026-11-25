// The one rule from a task's tags to the effort of the run that works on it
// (HAL-17252, requirement `engine.run-effort-tags`), so Studio and Paperclip
// read the same table instead of keeping copies. It follows HAL-16876's
// table with two levels only: where that table says `high`, a run keeps the
// default, since a run can think less than its agents are set to, never more.

import type { RunEffort } from "@halonicjs/ports";

/** What the rule reads from a task. */
export interface RunEffortTags {
  /** The task's label names, as written; case and surrounding spaces don't matter. */
  readonly labels: readonly string[];
  /** A reviewer handed the task back without an approval, so its run is a rerun. */
  readonly sentBack: boolean;
}

/**
 * Tags that make a task's work Opus-only by themselves: the `opus-only` tag
 * and the triage step's risk areas. Paperclip's effort table and the retry
 * detectors' routing guard keep the same list; a test in tooling/paperclip
 * fails when the three differ.
 */
export const opusOnlyRunTags: ReadonlySet<string> = new Set([
  "opus-only",
  "security",
  "trust",
  "sandbox",
  "schema",
  "secrets",
  "sign-in",
  "oauth",
  "keychain",
]);

/** Tags that keep a task's runs at the default effort by themselves: Opus-only work and design work. */
const keepDefaultTags: ReadonlySet<string> = new Set([...opusOnlyRunTags, "design"]);

/** The difficulty tags that let a run think less, from a one-file change up. */
const lowDifficultyTags: ReadonlySet<string> = new Set(["d1", "d2", "d3"]);

/** The difficulty tags too hard for less thinking. */
const hardDifficultyTags: ReadonlySet<string> = new Set(["d4", "d5"]);

/**
 * The effort for the run of a task with these tags: `low` for a `D1`–`D3`
 * task, and `default` for everything else. Any tag that asks for more wins
 * over a low difficulty, so a `D2` task in an opus-only area, a `D3` task
 * that is also `D4`, and a rerun after a send-back keep the default. A task
 * without a difficulty tag keeps it too, since it may not be code work.
 */
export function runEffortForTags(tags: RunEffortTags): RunEffort {
  if (tags.sentBack) return "default";
  const labels = tags.labels.map((label) => label.trim().toLowerCase());
  if (labels.some((label) => keepDefaultTags.has(label) || hardDifficultyTags.has(label))) {
    return "default";
  }
  return labels.some((label) => lowDifficultyTags.has(label)) ? "low" : "default";
}
