/**
 * Front bot v2 (HAL-19219, design on HAL-18847 section 2.3): the same
 * first-reply call also says whether the message is a quick question. The
 * plugin turns "quick" into the board's quick-run settings and stores them;
 * the server's run-start hook only reads that choice, for that one run (no
 * model call in the hook, Liam's condition 5). Pure, so the tests need no host.
 *
 * The model never names a model or an effort: it only says `quick` or
 * `normal`, and the board's settings decide what "quick" means. The server
 * still refuses anything that raises effort or picks a model off
 * `HALONIC_TASK_MODELS` (HAL-16866, HAL-16985).
 */

/** Efforts a quick run may get, lowest first. The server only ever lowers effort. */
export const quickEfforts = ["minimal", "low", "medium"] as const;
export type QuickEffort = (typeof quickEfforts)[number];

/** What the model said about the run. */
export type RunKind = "quick" | "normal";

/** The extra rule the prompt gets while the board has the run choice on. */
export const runChoiceInstruction = `After your reply (or SKIP), add one last line that is exactly "Run: quick" or "Run: normal".
Run: quick when the message only asks for a status, a link or a short fact. Run: normal for anything that asks for work, a decision, a review or an explanation, and whenever you are unsure.`;

const runLine = /^\s*run:\s*(quick|normal)\s*$/i;

/**
 * Splits the model's text into the reply and the run line. Only a run line
 * on the last line counts; without one, the run is `normal`.
 */
export function splitRunLine(text: string): { readonly reply: string; readonly run: RunKind } {
  const lines = text.trimEnd().split("\n");
  const last = lines.at(-1) ?? "";
  const match = runLine.exec(last);
  if (match === null) {
    return { reply: text, run: "normal" };
  }
  const run = match[1]?.toLowerCase() === "quick" ? "quick" : "normal";
  return { reply: lines.slice(0, -1).join("\n"), run };
}

/** A choice for one run, as the server's hook reads it. */
export interface RunChoice {
  readonly effort?: QuickEffort;
  readonly model?: string;
}

/** The board's settings for a quick run. */
export interface QuickRunSettings {
  readonly effort: QuickEffort;
  readonly model: string | undefined;
}

/** The choice to store: the quick-run settings for a quick message, none for a normal one. */
export function choiceFor(run: RunKind, quick: QuickRunSettings): RunChoice | undefined {
  if (run !== "quick") {
    return undefined;
  }
  return quick.model === undefined
    ? { effort: quick.effort }
    : { effort: quick.effort, model: quick.model };
}

/** A stored choice is for the run its message woke; one older than this is never used. */
export const choiceMaxAgeMs = 10 * 60 * 1000;

/** What the plugin keeps per chat task: the newest message's choice. */
export interface StoredRunChoice {
  readonly commentId: string;
  readonly at: string;
  readonly choice: RunChoice | null;
}

/** The stored choice when it is for this message and fresh; otherwise why not. */
export function matchChoice(
  stored: StoredRunChoice | null,
  commentId: string,
  now: Date,
): { readonly choice: RunChoice | null; readonly reason?: string } {
  if (stored === null) {
    return { choice: null, reason: "no choice stored for this task" };
  }
  if (stored.commentId !== commentId) {
    return { choice: null, reason: "the stored choice is for another message" };
  }
  if (now.getTime() - new Date(stored.at).getTime() > choiceMaxAgeMs) {
    return { choice: null, reason: "the stored choice is too old" };
  }
  if (stored.choice === null) {
    return { choice: null, reason: "normal run" };
  }
  return { choice: stored.choice };
}
