/**
 * The one table from a task's tags to the thinking effort its runs get
 * (HAL-16866 steps 2–3, requirement `paperclip.task-effort-rules`).
 *
 * The tags are the triage step's own words (HAL-16471): `D1` to `D4` for
 * difficulty (`D5` is accepted as harder still) and `opus-only` for risk,
 * so a task tagged by the triage step and a Paperclip task tagged by hand
 * read the same. The Halonic Code bridge sets an effort per model, not per
 * task (HAL-16735); when it goes per task it takes this table, not a copy.
 * The layer table keeps tooling and the bridge from importing each other,
 * so the move to a shared package comes with that change.
 */

/** The efforts Paperclip takes in `adapterConfig.effort`, weakest first. */
export const paperclipEfforts = ["low", "medium", "high", "xhigh", "max"] as const;

/** One of Paperclip's efforts. */
export type PaperclipEffort = (typeof paperclipEfforts)[number];

/**
 * The efforts the table sets by itself. Never `max`: security sign-offs and
 * the A0 release review are set by hand (Chief, HAL-16866).
 */
export type AutoEffort = "low" | "high";

/** How hard a task is, from `D1` (a one-file, exactly specified change) up. */
export type Difficulty = 1 | 2 | 3 | 4 | 5;

/** What the table reads from a task. */
export interface TaskTags {
  /** The task's `D1`–`D5` tag, or undefined when it has none (not a code task). */
  readonly difficulty: Difficulty | undefined;
  /** Tagged `opus-only`, or with an area only Opus works on (below). */
  readonly opusOnly: boolean;
  /** A reviewer handed it back without an approval, so its runs are a rerun after a send-back. */
  readonly sentBack: boolean;
}

/** Area tags that make a task opus-only by themselves, as the triage step's risk rule names them. */
export const opusOnlyAreas: ReadonlySet<string> = new Set([
  "security",
  "trust",
  "sandbox",
  "schema",
  "secrets",
  "sign-in",
  "oauth",
  "keychain",
]);

/** Difficulty tags from easiest to hardest. */
const difficultyTags = ["d1", "d2", "d3", "d4", "d5"] as const;

/** The hardest `D` tag among a task's labels, or undefined without one. */
function difficultyOf(labels: readonly string[]): Difficulty | undefined {
  let hardest: Difficulty | undefined;
  for (const label of labels) {
    const index = difficultyTags.indexOf(label as (typeof difficultyTags)[number]);
    if (index >= 0 && (hardest === undefined || index + 1 > hardest)) {
      hardest = (index + 1) as Difficulty;
    }
  }
  return hardest;
}

/** Reads a task's tags from its label names; case and surrounding spaces don't matter. */
export function tagsFromLabels(labelNames: readonly string[], sentBack: boolean): TaskTags {
  const labels = labelNames.map((name) => name.trim().toLowerCase());
  return {
    difficulty: difficultyOf(labels),
    opusOnly: labels.some((label) => label === "opus-only" || opusOnlyAreas.has(label)),
    sentBack,
  };
}

/**
 * The effort for a task's runs, or undefined when the table says nothing and
 * the agent's own setting applies:
 * - `high` for opus-only work, `D4` and harder, and a rerun after a send-back;
 * - `low` for a `D1`–`D3` code task outside those;
 * - nothing for a task without a difficulty tag that isn't opus-only.
 */
export function effortForTask(tags: TaskTags): AutoEffort | undefined {
  if (tags.opusOnly) {
    return "high";
  }
  if (tags.difficulty === undefined) {
    return undefined;
  }
  return tags.difficulty >= 4 || tags.sentBack ? "high" : "low";
}

/** Whether `value` is one of Paperclip's efforts. */
export function isPaperclipEffort(value: unknown): value is PaperclipEffort {
  return typeof value === "string" && (paperclipEfforts as readonly string[]).includes(value);
}
