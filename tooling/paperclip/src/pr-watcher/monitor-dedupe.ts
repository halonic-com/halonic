import type { PullLine } from "../state-packet/pull-line.ts";
import type { Decision, PullFacts } from "./decide.ts";
import { shortCheckMs } from "./monitors.ts";

/**
 * One monitor wake per pull request (HAL-20175). The author's short check
 * (due within the hour) is the only monitor the watcher left alone; it is
 * a second wake when the watcher wakes the author in the same pass, and an
 * empty one when nothing changed on the pull requests since the last
 * monitor wake. In both cases the watcher moves it out like a fallback
 * monitor. A failed `ci-ok` or a review finding never counts as unchanged
 * (`mustStayShort`).
 */

/** The `monitorDedupe` setting: `on` (the default) or `off`. */
export type DedupeMode = "on" | "off";

/** Reads the setting; anything but `off` is on. */
export function dedupeModeOf(config: Readonly<Record<string, unknown>>): DedupeMode {
  return config["monitorDedupe"] === "off" ? "off" : "on";
}

/**
 * What a monitor wake saw: when, and each open pull request as
 * `repo#number@head ci-ok`, sorted. `marks` is null while one was a draft,
 * whose light `ci-ok` the watcher doesn't read, so nothing compares to it.
 */
export interface MonitorCheck {
  readonly at: string;
  readonly marks: readonly string[] | null;
}

/** Why the watcher moved a short check. */
export type DedupeReason = "wake" | "unchanged";

/** The log's words for each reason. */
export const dedupeWords: Readonly<Record<DedupeReason, string>> = {
  wake: "the watcher wakes the author now",
  unchanged: "head and ci-ok unchanged since the last monitor check",
};

function mark(repo: string, number: number, head: string, ciOk: string): string {
  return `${repo}#${number}@${head} ${ciOk}`;
}

/** The marks of a monitor wake's pull request lines; null while an open one is a draft. */
export function lineMarks(lines: readonly PullLine[]): string[] | null {
  const open = lines.filter((line) => line.state === "open");
  if (open.some((line) => line.draft)) {
    return null;
  }
  return open.map((line) => mark(line.repo, line.number, line.commit, line.ciOk)).sort();
}

/** The marks of the watcher's facts, as `lineMarks` writes them; null while an open one is a draft. */
export function factMarks(pulls: readonly PullFacts[]): string[] | null {
  const open = pulls.filter((pull) => pull.state === "open");
  if (open.some((pull) => pull.draft)) {
    return null;
  }
  return open.map((pull) => mark(pull.repo, pull.number, pull.head, pull.ciOkOnHead)).sort();
}

/** Whether a monitor is the author's short check: due after `now`, within the hour. */
export function isShortCheck(nextCheckAt: string | null, now: Date): boolean {
  const dueInMs = (nextCheckAt === null ? Number.NaN : Date.parse(nextCheckAt)) - now.getTime();
  return dueInMs > 0 && dueInMs < shortCheckMs;
}

function sameMarks(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Whether "unchanged" can't be trusted for these pull requests. A failed
 * `ci-ok` stays the newest one until a same-head re-run's jobs finish, and
 * the watcher reports a red head only once, so the short check is the
 * author's only wake then. An open finding needs the short check pending, so
 * a progress note doesn't count as an answer (`answerOf`).
 */
function mustStayShort(pulls: readonly PullFacts[]): boolean {
  return pulls.some(
    (pull) =>
      pull.state === "open" && (pull.ciOkOnHead === "failure" || pull.latestReview !== undefined),
  );
}

/**
 * Why the short check of a task with these pull requests adds nothing, or
 * undefined when it may fire. `last` is read only when the watcher doesn't
 * wake the author anyway.
 */
export async function dedupeReason(
  decision: Decision,
  pulls: readonly PullFacts[],
  last: () => Promise<MonitorCheck | undefined>,
): Promise<DedupeReason | undefined> {
  if (decision.kind === "wake") {
    return "wake";
  }
  if (mustStayShort(pulls)) {
    return undefined;
  }
  const marks = factMarks(pulls);
  if (marks === null || marks.length === 0) {
    return undefined;
  }
  const check = await last();
  return check?.marks != null && sameMarks(marks, check.marks) ? "unchanged" : undefined;
}
