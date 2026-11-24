import { byReviewer } from "../pr-watcher/github.ts";

/**
 * Approving GitHub reviews by accounts other than the agents' shared one.
 * Agents approve in signed comments (HAL-14809), because they all share one
 * GitHub account, which can't approve its own pull requests. `cloud`'s
 * `main` rule asks for an approval from another account ("extra approval
 * for unattributed changes"), so there a person's GitHub review, the
 * board's so far, is what lets a pull request merge (HAL-16864, HAL-17730).
 */

/** The GitHub account every agent pushes, comments and merges as. */
export const agentAccount = "halonic-dev";

/** A review as the snapshot's GraphQL query reads it. */
export interface GitHubReview {
  readonly state: string;
  readonly authorAssociation: string;
  readonly commit?: { readonly oid: string } | null;
  /** Null when the account is gone. Absent in recordings made before the field. */
  readonly author?: { readonly login: string } | null;
}

/** One account's approval on GitHub, with the head it reviewed. */
export interface GitHubApproval {
  readonly by: string;
  readonly head: string;
}

/** The review states that set or clear an approval; a plain comment changes neither. */
const verdicts: ReadonlySet<string> = new Set(["APPROVED", "CHANGES_REQUESTED", "DISMISSED"]);

/**
 * Each account's standing approval, oldest first: its newest verdict is an
 * approval, not a request for changes or a dismissed review. Only the
 * repository's owner, members and collaborators count, never the agents'
 * shared account.
 */
export function githubApprovals(reviews: readonly GitHubReview[]): GitHubApproval[] {
  const newest = new Map<string, GitHubReview>();
  for (const review of reviews) {
    const login = review.author?.login;
    const counted = byReviewer({ author_association: review.authorAssociation });
    if (login !== undefined && login !== agentAccount && counted && verdicts.has(review.state)) {
      // Delete first, so an account's place follows its newest verdict.
      newest.delete(login);
      newest.set(login, review);
    }
  }
  return [...newest].flatMap(([by, review]) =>
    review.state === "APPROVED" && review.commit != null ? [{ by, head: review.commit.oid }] : [],
  );
}
