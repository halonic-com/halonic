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
  "by paths; security/release PRs, the author's own PRs and PRs not written by the team route differently";

/** The rules for one repository, or undefined when the tool gives it none. */
export function reviewerRulesOf(tool: Tool, repo: string): RepositoryReviewerRules | undefined {
  const settings = tool.action.with;
  return "reviewerRules" in settings ? settings.reviewerRules?.[repo] : undefined;
}

/** One changed file as GitHub lists it; a rename also names the old path. */
interface ChangedFile {
  readonly filename: string;
  readonly previous_filename?: string;
  readonly additions?: number;
  readonly deletions?: number;
}

/** The paths a pull request changes, and the changed lines (additions plus deletions) of each. */
export interface ChangedFiles {
  /** Both sides of a rename, so moving a file out of a folder still counts. */
  readonly paths: readonly string[];
  /**
   * Changed lines by path. A renamed file counts once, under its new name, as
   * halonic's own `linesByFile` does; its old name counts 0, so it never falls
   * back to the whole pull request's lines.
   */
  readonly lines: Readonly<Record<string, number>>;
  /**
   * Each renamed file's old path, by its new path: a folder line limit counts
   * a file moved out of its folders, as halonic's `codeLines` does.
   */
  readonly renamedFrom: Readonly<Record<string, string>>;
}

/** Every path a pull request changes, with its changed lines. */
export async function changedFiles(
  get: GitHubGet,
  repo: string,
  number: number,
): Promise<ChangedFiles> {
  const files = (await everyPage(get, `/repos/${repo}/pulls/${number}/files`)) as ChangedFile[];
  const paths: string[] = [];
  const lines: Record<string, number> = {};
  const renamedFrom: Record<string, string> = {};
  for (const file of files) {
    if (file.previous_filename !== undefined) {
      paths.push(file.previous_filename);
      // `??=`: when files swap names, the old name is another file's new one.
      lines[file.previous_filename] ??= 0;
      renamedFrom[file.filename] = file.previous_filename;
    }
    paths.push(file.filename);
    lines[file.filename] = (file.additions ?? 0) + (file.deletions ?? 0);
  }
  return { paths, lines, renamedFrom };
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
    narrowKeep: toRegExps(rules.narrowTo?.patterns ?? []),
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
 * Changed lines in the `picked` paths. Without a picked path's own count,
 * the whole pull request's lines stand in for them, which can only escalate
 * more often, never less.
 */
function linesIn(
  picked: readonly string[],
  changedLines: number,
  fileLines: Readonly<Record<string, number>> | undefined,
): number {
  let sum = 0;
  for (const path of picked) {
    const lines = fileLines?.[path];
    if (lines === undefined) {
      return changedLines;
    }
    sum += lines;
  }
  return sum;
}

/**
 * Whether the pull request is over the line limit or one of its folder
 * limits, counting only the files the limit doesn't skip. A renamed file
 * counts toward a folder limit when its new or its old path is in it.
 */
function overLineLimit(
  rules: RepositoryReviewerRules,
  regexps: ReturnType<typeof compiled>,
  paths: readonly string[],
  changedLines: number,
  fileLines: Readonly<Record<string, number>> | undefined,
  renamedFrom: Readonly<Record<string, string>> | undefined,
): boolean {
  if (rules.lineLimit === undefined) {
    return false;
  }
  const counted = paths.filter((path) => !matchesAny(regexps.lineSkip, path));
  if (counted.length === 0) {
    return false;
  }
  if (linesIn(counted, changedLines, fileLines) > rules.lineLimit.max) {
    return true;
  }
  return rules.lineLimit.folderLimits.some((limit) => {
    const inLimit = (path: string | undefined) =>
      path !== undefined && limit.folders.some((folder) => path.startsWith(folder));
    const inFolders = counted.filter((path) => inLimit(path) || inLimit(renamedFrom?.[path]));
    return inFolders.length > 0 && linesIn(inFolders, changedLines, fileLines) > limit.max;
  });
}

/**
 * The role below `escalateTo`: `narrowTo.role` when the rules give one and
 * no path is under its `folders` or matches its `patterns`; otherwise
 * `default`.
 */
function roleBelowEscalation(
  rules: RepositoryReviewerRules,
  regexps: ReturnType<typeof compiled>,
  paths: readonly string[],
): ReviewRole {
  const narrow = rules.narrowTo;
  if (narrow === undefined) {
    return rules.default;
  }
  const keepsDefault = paths.some(
    (path) =>
      narrow.folders.some((folder) => path.startsWith(folder)) ||
      matchesAny(regexps.narrowKeep, path),
  );
  return keepsDefault ? rules.default : narrow.role;
}

/**
 * The role by the rules: `escalateTo` when a path fires a rule or the pull
 * request is over a line limit; otherwise `narrowTo.role` when it lets the
 * pull request narrow, and `default` when not. `fileLines` gives each
 * path's changed lines; without it, the line limits count the whole pull
 * request's `changedLines`. `renamedFrom` gives renamed files' old paths.
 */
export function reviewRoleByPaths(
  rules: RepositoryReviewerRules,
  paths: readonly string[],
  changedLines: number,
  fileLines?: Readonly<Record<string, number>>,
  renamedFrom?: Readonly<Record<string, string>>,
): ReviewRole {
  const regexps = compiled(rules);
  if (
    overLineLimit(rules, regexps, paths, changedLines, fileLines, renamedFrom) ||
    paths.some((path) => escalatesPath(rules, regexps, path))
  ) {
    return rules.escalateTo;
  }
  return roleBelowEscalation(rules, regexps, paths);
}

/** The role and the agent the routing names for it. */
export function reviewerByPaths(
  rules: RepositoryReviewerRules,
  files: ChangedFiles,
  changedLines: number,
  routing: Routing | undefined,
): ReviewerByPaths {
  const role = reviewRoleByPaths(rules, files.paths, changedLines, files.lines, files.renamedFrom);
  return { role, person: routing?.roles[role] };
}

/** What an approval by a reviewer below `escalateTo` can't see: the author's word that the PR is security or release. */
export const defaultReviewerNote = "unless it's a security or release pull request";

/**
 * The approvals, with the note on a counting one signed by the agent who
 * covers the role the paths pick when it is below `escalateTo` (`default` or
 * `narrowTo.role`): the paths let that reviewer approve, but a security or release pull request still
 * goes to the `escalateTo` role. `signedBy` matches a signature to the agent.
 */
export function noteDefaultReviewer(
  found: readonly Approval[],
  rules: RepositoryReviewerRules | undefined,
  reviewer: ReviewerByPaths | undefined,
  signedBy: (by: string) => boolean,
): Approval[] {
  if (rules === undefined || reviewer?.person === undefined || reviewer.role === rules.escalateTo) {
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
