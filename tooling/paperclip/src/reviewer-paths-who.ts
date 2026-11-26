/**
 * Who reviews a pull request on `halonic`: the one answer every tool reads
 * (the board, HAL-19639). The path rules pick a role (`reviewerRoleFor`), the
 * routing names who covers it (`routing.ts`), and the author rule below keeps
 * a reviewer off their own pull request (HAL-14809). The PR watcher, `pr_status`,
 * `review_verdict`, the Merger's gate report and `cli/reviewer.ts` (which the
 * server's watcher runs) all call these, so they can't drift apart; a test
 * fails when another file starts its own reviewer list.
 */
import type { Routing } from "@halonicjs/format";
import { type RoutedPull, reviewerFor, reviewerRoleFor } from "./reviewer-paths.ts";

/** Who reviews a pull request on `halonic` today (HAL-14809, HAL-19283). */
export type Reviewer = "nora" | "julian" | "liam";

/** Each reviewer's name as their signed line writes it. */
export const reviewerNames: Readonly<Record<Reviewer, string>> = {
  nora: "Nora",
  julian: "Julian",
  liam: "Liam",
};

/** The reviewers whose approval counts only within their limits: Julian's, and Nora's routine scope. */
export const limitedReviewerNames: readonly string[] = [reviewerNames.julian, reviewerNames.nora];

/** Whose approval rules a reviewer by the paths stands for: Liam's, or the second reviewer's (Julian and Nora). */
export function approvalRole(reviewer: Reviewer): "liam" | "julian" {
  return reviewer === "liam" ? "liam" : "julian";
}

/**
 * Whose approval rules a pull request falls under by its paths: `liam` when
 * only the code reviewer may approve it, `julian` otherwise (Nora's routine
 * scope is judged apart, by `routineRefusal`). Approvals are judged by the
 * roles in code, never the routing's people (HAL-14809, HAL-19283).
 */
export function pathReviewer(pull: RoutedPull): "liam" | "julian" {
  return reviewerRoleFor(pull) === "code-reviewer" ? "liam" : "julian";
}

/**
 * The reviewer of a task's pull requests, from each one's reviewer by its
 * paths: Liam when any is his, else Julian when any is his, else Nora
 * (HAL-19283). Liam's own pull requests go to Julian, whose approval counts on
 * any path there, and Julian's go to Liam (HAL-14809). Nora never reviews her
 * own: hers go to Julian at the least.
 */
export function reviewerOf(author: string | undefined, byPaths: readonly Reviewer[]): Reviewer {
  if (author === "liam") {
    return "julian";
  }
  if (author === "julian") {
    return "liam";
  }
  if (byPaths.includes("liam")) {
    return "liam";
  }
  return byPaths.includes("julian") || byPaths.length === 0 || author === "nora"
    ? "julian"
    : "nora";
}

/**
 * The agent who reviews one pull request: the reviewer by its paths
 * (`reviewerFor`), moved off its author by `reviewerOf`. With a routing, the
 * person it names for the role; the author rule applies only to today's
 * people, since a routing that names someone else already chose them.
 *
 * @param pull - the routed pull request (`routedFromRest`)
 * @param author - the agent its branch names (`branchOwner`), or undefined for a fork
 * @param routing - the active workspace snapshot's routing, or undefined for today's people
 */
export function reviewerOfPull(
  pull: RoutedPull,
  author: string | undefined,
  routing?: Routing,
): string {
  if (routing !== undefined) {
    return reviewerFor(pull, routing);
  }
  return reviewerOf(author, [reviewerFor(pull)]);
}
