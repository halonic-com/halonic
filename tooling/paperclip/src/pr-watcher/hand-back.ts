import { closedOutcome, type PullFacts, short } from "./decide.ts";

/**
 * The hand-back of a task its reviewer holds to the author of its pull
 * requests (HAL-21150): after the reviewer's verdict on the head, the task is
 * the author's again, whatever runner the reviewer used. No I/O here.
 */

/** Why a reviewer-held task goes back to its author now. */
export interface HandBack {
  readonly pull: PullFacts;
  readonly why: "approved" | "findings" | "held" | "merged";
  /** Makes a repeated hand-back of the same head a no-op. */
  readonly key: string;
}

/** The reviewer's name as approvals and findings carry it: `liam` is `Liam`. */
export function reviewerName(urlKey: string): string {
  return urlKey.charAt(0).toUpperCase() + urlKey.slice(1);
}

/** Whether the reviewer's newest finding was made after the head was committed. */
function findingOnHead(pull: PullFacts, reviewer: string): boolean {
  const review = pull.latestReview;
  if (review?.by !== reviewer) {
    return false;
  }
  // A conversation comment carries no head: one older than the head was about an earlier one.
  return pull.headCommittedAt === undefined || review.at >= pull.headCommittedAt;
}

function verdictOf(pull: PullFacts, reviewer: string): HandBack["why"] | undefined {
  if (pull.held !== undefined) {
    return "held";
  }
  if (pull.draft) {
    return undefined;
  }
  // A signed approval names the head by its first 7 characters or more.
  const approvals = pull.approvals ?? [];
  if (
    approvals.some(({ by, head }) => by === reviewer && head !== "" && pull.head.startsWith(head))
  ) {
    return "approved";
  }
  return findingOnHead(pull, reviewer) ? "findings" : undefined;
}

/**
 * Why the task goes back to its author: a merge that landed, the queue
 * holding a head, or the holder's verdict (a signed approval or a finding)
 * on an open pull request's head; undefined while the review is still due.
 */
export function handBackOf(reviewer: string, pulls: readonly PullFacts[]): HandBack | undefined {
  const closed = closedOutcome(pulls);
  if (closed?.kind === "done") {
    const [pull] = closed.pulls;
    return pull === undefined ? undefined : keyed(pull, "merged");
  }
  for (const pull of pulls.filter((each) => each.state === "open")) {
    const why = verdictOf(pull, reviewer);
    if (why !== undefined) {
      return keyed(pull, why);
    }
  }
  return undefined;
}

function keyed(pull: PullFacts, why: HandBack["why"]): HandBack {
  return { pull, why, key: `${pull.repo}#${pull.number} ${short(pull.head)} back to author` };
}

/** The comment that goes with the hand-back. */
export function handBackMessage(author: string, back: HandBack): string {
  const words = {
    approved: "after review",
    findings: "after review",
    held: "after the merge queue held it",
    merged: "after the merge",
  }[back.why];
  return [
    `PR watcher: back to ${author} ${words}, head \`${short(back.pull.head)}\` (HAL-21150).`,
    `- [#${back.pull.number}](${back.pull.url})`,
  ].join("\n");
}
