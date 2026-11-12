import type { GithubApprover } from "./signatures.ts";

/** One review of a pull request, as GitHub's API lists them, oldest first. */
export interface Review {
  readonly userId: number;
  /** `APPROVED`, `CHANGES_REQUESTED`, `COMMENTED`, `DISMISSED` or `PENDING`. */
  readonly state: string;
  /** The commit the review was made on. */
  readonly commitId: string;
}

/** Lists a pull request's reviews. Throws when it can't, so the guard fails closed. */
export type ReviewSource = (repo: string, pull: number) => Promise<readonly Review[]>;

/**
 * The reviews of a pull request, read live from GitHub's API with the
 * run's read-only token. Any error throws: a lookup that can't finish is
 * never an approval.
 */
export function githubReviews(token: string, fetchPage: typeof fetch = fetch): ReviewSource {
  return async (repo, pull) => {
    const reviews: Review[] = [];
    let url: string | undefined =
      `https://api.github.com/repos/${repo}/pulls/${pull}/reviews?per_page=100`;
    while (url !== undefined) {
      const response = await fetchPage(url, {
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${token}`,
          "x-github-api-version": "2022-11-28",
        },
      });
      if (!response.ok) {
        throw new Error(`GitHub answered ${response.status} when listing the reviews`);
      }
      const page = (await response.json()) as {
        user: { id: number } | null;
        state: string;
        commit_id: string;
      }[];
      for (const review of page) {
        reviews.push({
          userId: review.user?.id ?? 0,
          state: review.state,
          commitId: review.commit_id,
        });
      }
      url = /<([^>]+)>;\s*rel="next"/.exec(response.headers.get("link") ?? "")?.[1];
    }
    return reviews;
  };
}

/**
 * Whether one of the approvers' latest standing review is an approval of
 * `head`. A later `CHANGES_REQUESTED` or dismissal replaces an approval; a
 * plain comment doesn't. An approval of an older commit doesn't count.
 */
export function approvedAt(
  reviews: readonly Review[],
  approvers: readonly GithubApprover[],
  head: string,
): GithubApprover | undefined {
  return approvers.find((approver) => {
    const standing = reviews
      .filter((review) => review.userId === approver.userId)
      .filter((review) => review.state !== "COMMENTED" && review.state !== "PENDING")
      .at(-1);
    return standing?.state === "APPROVED" && standing.commitId === head;
  });
}
