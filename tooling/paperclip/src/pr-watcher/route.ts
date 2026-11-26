import { type ChangedFile, readManifests, routedFromRest } from "../pr-tools/manifests.ts";
import { branchPath, type PullDetails } from "../pr-tools/pr-status.ts";
import {
  isSecurityPath,
  julianRebaseRefusal,
  type ReviewRole,
  type RoutedPull,
  reviewerFor,
  reviewerRoleFor,
  routedPaths,
  routineRefusal,
} from "../reviewer-paths.ts";
import { reviewerOfPull } from "../reviewer-paths-who.ts";
import { branchOwner } from "./decide.ts";
import { everyPage, type GitHubGet } from "./github.ts";
import type { ReviewerRoute } from "./handoff.ts";

/** A pull request as GitHub gives it, and what the path rules read off it. */
export interface RoutedRead {
  readonly pull: PullDetails;
  readonly routed: RoutedPull;
}

/**
 * Reads one pull request the way `pr_status` reads it for the path rules: the
 * changed files and lines, and each changed package manifest at the merge
 * base and `head` (its current head when not given). About 4 GET requests.
 */
export async function readRouted(
  get: GitHubGet,
  repo: string,
  number: number,
  head?: string,
): Promise<RoutedRead> {
  const [pull, files] = await Promise.all([
    get(`/repos/${repo}/pulls/${number}`) as Promise<PullDetails>,
    everyPage(get, `/repos/${repo}/pulls/${number}/files`) as Promise<ChangedFile[]>,
  ]);
  const at = head ?? pull.head.sha;
  const compare = (await get(`/repos/${repo}/compare/${branchPath(pull.base.ref)}...${at}`)) as {
    merge_base_commit?: { sha?: string };
  };
  const manifests = await readManifests(get, repo, files, {
    base: compare.merge_base_commit?.sha,
    head: at,
  });
  return { pull, routed: routedFromRest(pull, repo, files, manifests) };
}

/**
 * The reviewer by the path rules and whether they make it a security pull
 * request, read with `readRouted`, and only for a pull request that is ready
 * for review, so a pass stays cheap. Whether it's a security or release pull
 * request the paths can't always tell (`isSecurityPath` catches the security
 * paths): its author says so on the task (`PR watcher: own review task`),
 * and then the watcher never routes it.
 */
export function gitHubRoute(get: GitHubGet): ReviewerRoute {
  return async ({ repo, number, head }) => {
    const { pull, routed } = await readRouted(get, repo, number, head);
    // A renamed file counts by its old path too (HAL-19283).
    const paths = routedPaths(routed);
    return {
      reviewer: reviewerFor(routed),
      security: paths.some(isSecurityPath),
      rebaseRefusal: julianRebaseRefusal({ files: paths, branch: pull.head.ref }),
      routineRefusal: routineRefusal(routed),
    };
  };
}

/** Who reviews one pull request, for a caller outside this package (`cli/reviewer.ts`). */
export interface ReviewerAnswer {
  readonly repo: string;
  readonly number: number;
  readonly head: string;
  /** The agent its branch names, or null for a fork or a branch without one. */
  readonly author: string | null;
  /** The agent who reviews it (`reviewerOfPull`): never its author. */
  readonly reviewer: string;
  /** The role its paths need (`reviewerRoleFor`). */
  readonly role: ReviewRole;
  /** Why the routine reviewer can't approve it alone, or null when she can (`routineRefusal`). */
  readonly routineRefusal: string | null;
}

/**
 * The shared answer to "who reviews this pull request" (HAL-19639), read
 * from GitHub: what the PR watcher and `pr_status` decide, for the server's
 * watcher and any other tool that can't import this package.
 */
export async function reviewerAnswer(
  get: GitHubGet,
  repo: string,
  number: number,
): Promise<ReviewerAnswer> {
  const { pull, routed } = await readRouted(get, repo, number);
  const ours = pull.head.repo?.full_name.toLowerCase() === repo.toLowerCase();
  const author = ours ? branchOwner(pull.head.ref) : undefined;
  return {
    repo,
    number,
    head: pull.head.sha,
    author: author ?? null,
    reviewer: reviewerOfPull(routed, author),
    role: reviewerRoleFor(routed),
    routineRefusal: routineRefusal(routed),
  };
}
