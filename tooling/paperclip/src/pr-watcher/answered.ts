import { type Memory, type PullFacts, short, type WatchedTask } from "./decide.ts";
import type { Reviewer } from "./handoff.ts";
import { shortCheckMs } from "./monitors.ts";

/**
 * A change request the author answered (HAL-18460): a pull request with an
 * open review finding normally waits for its author, so the reviewer heard
 * nothing until the author handed the task back by hand. Once the author
 * pushed a new head after the finding, or replied on the task after it, the
 * task goes back to the reviewer who asked, once per finding and head.
 * Rules only, no I/O, like `handoff.ts`.
 */

/** How the author answered a finding. */
export type Answer = "push" | "reply";

/** `Answer` by `pullId`, for the pull requests whose finding was answered. */
export type Answers = ReadonlyMap<string, Answer>;

/** The key of a handoff after an answered finding: once per finding and head. */
export function answeredKey(pull: PullFacts): string {
  return `${pull.repo}#${pull.number} ${short(pull.head)} answered ${pull.latestReview?.id ?? ""}`;
}

/** Its holder set a monitor due within the hour: they wait on their own short check, such as CI. */
function shortCheckPending(task: WatchedTask, now: Date): boolean {
  const due = Date.parse(task.monitorNextCheckAt ?? "") - now.getTime();
  return !Number.isNaN(due) && due < shortCheckMs;
}

/**
 * How the author answered the pull request's open finding, if they did: a
 * head they committed after it, or a task comment after it while no short check
 * of theirs is pending. A comment with a short check pending is a progress
 * note ("fixing it, CI is running"), not an answer.
 */
export function answerOf(
  pull: PullFacts,
  task: WatchedTask,
  memory: Memory,
  now: Date,
): Answer | undefined {
  const finding = pull.latestReview;
  if (finding === undefined) {
    return undefined;
  }
  const after = (at: string | undefined) =>
    at !== undefined && Date.parse(at) > Date.parse(finding.at);
  // A head GitHub committed is a rebase it made, such as the watcher's own stack rebase: no fix.
  if (after(pull.headCommittedAt) && pull.headCommittedByGitHub !== true) {
    return "push";
  }
  return after(memory.authorLastAt) && !shortCheckPending(task, now) ? "reply" : undefined;
}

/**
 * The reviewer who asked for changes on any of these pull requests, when a
 * finding names one: Liam when any names him, otherwise Julian, then Nora.
 */
export function blockingReviewer(pulls: readonly PullFacts[]): Reviewer | undefined {
  const names = pulls.map((pull) => pull.latestReview?.by);
  if (names.includes("Liam")) {
    return "liam";
  }
  if (names.includes("Julian")) {
    return "julian";
  }
  return names.includes("Nora") ? "nora" : undefined;
}

/**
 * Who gets an answered change request: Liam when he asked, since only he
 * can lift his own request; when Julian asked, the reviewer by the usual
 * rules, so Julian unless a pull request is Liam's by its paths. Liam's and
 * Julian's own pull requests keep their fixed reviewer (HAL-14809).
 */
export function reviewerAfterAnswer(
  author: string | undefined,
  blocking: Reviewer | undefined,
  byRules: Reviewer,
): Reviewer {
  if (blocking !== "liam" || author === "liam" || author === "julian") {
    return byRules;
  }
  return "liam";
}

/** The handoff comment's line for an answered finding. */
export function answerLine(pull: PullFacts, answer: Answer): string {
  const who = pull.latestReview?.by ?? "the reviewer";
  const how =
    answer === "push"
      ? `a new head \`${short(pull.head)}\` pushed after it`
      : "the author replied on this task after it";
  return `#${pull.number}: answers ${who}'s change request: ${how}.`;
}
