import type { PullLine } from "../state-packet/pull-line.ts";

/**
 * The wake gate's decision for one monitor wake (HAL-18985, lever 6 of the
 * token plan on HAL-18938): does the woken session have something to do, or
 * would it only read state and hand off again? Worked out from the task's
 * pull request lines and its newest comment only, so every rule is tested
 * without GitHub or Paperclip.
 *
 * It skips only when every pull request is waiting on someone else and
 * nobody but the task's holder wrote since. Anything it can't place runs:
 * a skipped wake that mattered costs more than a run that only checked.
 */

/** The outcome, with the reason for the log. */
export type Verdict =
  | { readonly kind: "skip"; readonly why: string }
  | { readonly kind: "run"; readonly why: string };

/** Who wrote the task's newest comment, as far as the gate cares. */
export type NewestComment =
  /** The task has no comments. */
  | { readonly by: "none" }
  /** The task's holder wrote it: its own hand-off, nothing new for it. */
  | { readonly by: "holder" }
  /** Someone else wrote it: a person, another agent or a plugin. */
  | { readonly by: "other" };

/** A pull request's name for the log: `acme/rockets#41`. */
function nameOf(line: PullLine): string {
  return `${line.repo}#${line.number}`;
}

/** What `line` is waiting for, or undefined when its author has something to do. */
export function waitingFor(line: PullLine): string | undefined {
  if (line.state === "closed") {
    return undefined;
  }
  if (line.state === "merged") {
    // Once `ci-ok` on the merge commit finished, the task can be closed or the break fixed.
    return line.ciOk === "pending" ? "ci-ok on its merge commit" : undefined;
  }
  if (line.draft || line.mergeable === "conflict") {
    return undefined;
  }
  if (line.ciOk === "pending") {
    return "ci-ok on its head";
  }
  if (line.ciOk !== "success") {
    // Red, or no `ci-ok` at all: the author looks.
    return undefined;
  }
  if (line.queue !== false) {
    return "the merge queue";
  }
  return line.approvedBy.length > 0 ? "the merge (approved)" : "a review";
}

/** The gate's verdict for a monitor wake on a task with these pull request lines. */
export function wakeVerdict(lines: readonly PullLine[], newest: NewestComment): Verdict {
  if (lines.length === 0) {
    return { kind: "run", why: "no pull request to read the state from" };
  }
  if (newest.by === "other") {
    return { kind: "run", why: "the newest comment is from someone else" };
  }
  const waits: string[] = [];
  for (const line of lines) {
    const what = waitingFor(line);
    if (what === undefined) {
      return { kind: "run", why: `${nameOf(line)} needs its author` };
    }
    waits.push(`${nameOf(line)} waits for ${what}`);
  }
  return { kind: "skip", why: waits.join("; ") };
}
