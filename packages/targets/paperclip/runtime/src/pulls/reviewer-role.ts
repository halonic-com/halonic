import type { RepositoryReviewerRules, Routing, Tool } from "@halonicjs/format";
import type { GitHubGet } from "../github.ts";
import { everyPage } from "./reads.ts";
import type { Approval } from "./reviews.ts";

/**
 * Which role reviews a pull request by the company's path rules (the tool's
 * `reviewerRules`, HAL-18292), and who covers that role in the snapshot's
 * routing. Paths and sizes are all it sees: a security or release PR the
 * author declares, and the rules on who reviews whose PRs, route on top of
 * it, so the answer always says it is by paths.
 */

/** A review role the rules can name. */
export type ReviewRole = RepositoryReviewerRules["default"];

/** The reviewer by the path rules. */
export interface ReviewerByPaths {
  readonly role: ReviewRole;
  /** The agent's url key that covers the role, or undefined when the routing names none. */
  readonly person: string | undefined;
}

/** What the paths-only answer can't see; said every time, so it never reads as final. */
export const pathsOnlyNote =
  "by paths; security/release PRs and the author's own PRs route differently";

/** The rules for one repository, or undefined when the tool gives it none. */
export function reviewerRulesOf(tool: Tool, repo: string): RepositoryReviewerRules | undefined {
  const settings = tool.action.with;
  return "reviewerRules" in settings ? settings.reviewerRules?.[repo] : undefined;
}

/** One changed file as GitHub lists it; a rename also names the old path. */
interface ChangedFile {
  readonly filename: string;
  readonly previous_filename?: string;
}

/** Every path a pull request changes: both sides of a rename, so moving a file out of a folder still counts. */
export async function changedPaths(
  get: GitHubGet,
  repo: string,
  number: number,
): Promise<string[]> {
  const files = (await everyPage(get, `/repos/${repo}/pulls/${number}/files`)) as ChangedFile[];
  return files.flatMap((file) =>
    file.previous_filename === undefined
      ? [file.filename]
      : [file.filename, file.previous_filename],
  );
}

/** Whether any of the regexes matches the path. */
function matchesAny(patterns: readonly RegExp[], path: string): boolean {
  return patterns.some((pattern) => pattern.test(path));
}

/** The rules with their regexes compiled once, for matching many paths. */
function compiled(rules: RepositoryReviewerRules) {
  const toRegExps = (sources: readonly string[]) => sources.map((source) => new RegExp(source));
  return {
    wordsSkip: toRegExps(rules.wordsSkip),
    lineSkip: toRegExps(rules.lineLimit?.skip ?? []),
    words: rules.words.map((word) => word.toLowerCase()),
  };
}

/** Whether one changed path fires a rule, without the line limit. */
function escalatesPath(
  rules: RepositoryReviewerRules,
  regexps: ReturnType<typeof compiled>,
  path: string,
): boolean {
  if (rules.files.includes(path) || rules.folders.some((folder) => path.startsWith(folder))) {
    return true;
  }
  if (rules.nestedPackageJson && path.endsWith("/package.json")) {
    return true;
  }
  if (matchesAny(regexps.wordsSkip, path)) {
    return false;
  }
  const lower = path.toLowerCase();
  return regexps.words.some((word) => lower.includes(word));
}

/**
 * The role by the rules: `escalateTo` when a path fires a rule or the pull
 * request is over the line limit with a file the limit doesn't skip;
 * otherwise `default`.
 */
export function reviewRoleByPaths(
  rules: RepositoryReviewerRules,
  paths: readonly string[],
  changedLines: number,
): ReviewRole {
  const regexps = compiled(rules);
  const overLimit =
    rules.lineLimit !== undefined &&
    changedLines > rules.lineLimit.max &&
    !paths.every((path) => matchesAny(regexps.lineSkip, path));
  if (overLimit || paths.some((path) => escalatesPath(rules, regexps, path))) {
    return rules.escalateTo;
  }
  return rules.default;
}

/** The role and the agent the routing names for it. */
export function reviewerByPaths(
  rules: RepositoryReviewerRules,
  paths: readonly string[],
  changedLines: number,
  routing: Routing | undefined,
): ReviewerByPaths {
  const role = reviewRoleByPaths(rules, paths, changedLines);
  return { role, person: routing?.roles[role] };
}

/** What an approval by the `default` reviewer can't see: the author's word that the PR is security or release. */
export const defaultReviewerNote = "unless it's a security or release pull request";

/**
 * The approvals, with the note on a counting one signed by the agent who
 * covers the rules' `default` role when the paths pick that role: the paths
 * let that reviewer approve, but a security or release pull request still
 * goes to the `escalateTo` role. `signedBy` matches a signature to the agent.
 */
export function noteDefaultReviewer(
  found: readonly Approval[],
  rules: RepositoryReviewerRules | undefined,
  reviewer: ReviewerByPaths | undefined,
  signedBy: (by: string) => boolean,
): Approval[] {
  if (rules === undefined || reviewer?.person === undefined || reviewer.role !== rules.default) {
    return [...found];
  }
  return found.map((approval) =>
    approval.counts && signedBy(approval.by)
      ? { ...approval, note: defaultReviewerNote }
      : approval,
  );
}

/** The `reviewer` line an agent reads. */
export function reviewerText(reviewer: ReviewerByPaths | undefined): string {
  if (reviewer === undefined) {
    return "reviewer: none (no path rules for this repository)";
  }
  if (reviewer.person === undefined) {
    return `reviewer: ${reviewer.role}, no one covers it in the routing (${pathsOnlyNote})`;
  }
  return `reviewer: ${reviewer.person} as ${reviewer.role} (${pathsOnlyNote})`;
}
