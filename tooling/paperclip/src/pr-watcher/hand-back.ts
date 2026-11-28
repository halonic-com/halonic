import { closedOutcome, marker, newestMerge, type PullFacts, short } from "./decide.ts";

/**
 * The hand-back of a task its reviewer holds to the author of its pull
 * requests (HAL-21150): after the reviewer's verdict on the head, the task is
 * the author's again, whatever runner the reviewer used. No I/O here.
 */

/** Why a reviewer-held task goes back to its author now. */
export interface HandBack {
  readonly pull: PullFacts;
  readonly why: "approved" | "findings" | "merged";
  /**
   * One per verdict: the head and the approval or the finding's id, so a
   * second verdict on the same head (after the author answered a finding)
   * hands the task back again, with a wake of its own.
   */
  readonly key: string;
}

/**
 * Whether the reviewer's newest finding still stands on the head: by
 * `paperclip.pr-watcher-hand-back`, any head committed after it answers it.
 */
function findingOnHead(pull: PullFacts, reviewer: string): boolean {
  const review = pull.latestReview;
  if (review?.by !== reviewer) {
    return false;
  }
  const committed = pull.headCommittedAt;
  return !(committed !== undefined && Date.parse(committed) > Date.parse(review.at));
}

function verdictOf(pull: PullFacts, reviewer: string): HandBack | undefined {
  if (pull.draft) {
    return undefined;
  }
  // A signed approval names the head by its first 7 characters or more.
  const approvals = pull.approvals ?? [];
  if (
    approvals.some(({ by, head }) => by === reviewer && head !== "" && pull.head.startsWith(head))
  ) {
    return keyed(pull, "approved", "approved");
  }
  const review = pull.latestReview;
  return review !== undefined && findingOnHead(pull, reviewer)
    ? keyed(pull, "findings", review.id)
    : undefined;
}

/**
 * Why the task goes back to its author: a merge that landed, or the
 * holder's verdict (a signed approval or a finding) on an open pull
 * request's head that wasn't `reported` yet; undefined while the review is
 * still due. A merge is keyed by the newest one, so a second merge on the
 * task gets its own key; it comes back even when reported, since the task
 * may be done by now.
 */
export function handBackOf(
  reviewer: string,
  pulls: readonly PullFacts[],
  reported: ReadonlySet<string>,
): HandBack | undefined {
  const closed = closedOutcome(pulls);
  if (closed?.kind === "done") {
    const pull = newestMerge(closed.pulls);
    return pull === undefined ? undefined : keyed(pull, "merged", "merged");
  }
  for (const pull of pulls.filter((each) => each.state === "open")) {
    const back = verdictOf(pull, reviewer);
    if (back !== undefined && !reported.has(back.key)) {
      return back;
    }
  }
  return undefined;
}

/** The keys of the holder's verdicts on every open pull request's head, reported or not. */
export function standingVerdicts(reviewer: string, pulls: readonly PullFacts[]): string[] {
  return pulls
    .filter((pull) => pull.state === "open")
    .flatMap((pull) => verdictOf(pull, reviewer)?.key ?? []);
}

function keyed(pull: PullFacts, why: HandBack["why"], verdict: string): HandBack {
  const key = `${pull.repo}#${pull.number} ${short(pull.head)} back to author ${verdict}`;
  return { pull, why, key };
}

/**
 * The comment that goes with the hand-back, with its marker and the markers
 * of the states it answers (`also`), so neither is reported again.
 */
export function handBackMessage(
  author: string,
  back: HandBack,
  also: readonly string[] = [],
): string {
  const words = back.why === "merged" ? "after the merge" : "after review";
  return [
    `PR watcher: back to ${author} ${words}, head \`${short(back.pull.head)}\` (HAL-21150).`,
    `- [#${back.pull.number}](${back.pull.url})`,
    ...[back.key, ...also].map(marker),
  ].join("\n");
}
