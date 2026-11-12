import { Report } from "../lib/problems.ts";
import { type PullRequest, signedApprovals } from "./approvals.ts";
import { decisionNoteFile, parseDecisionNote } from "./decision-notes.ts";
import { guardedPaths, onlyExtraExportsChanged, policyFile } from "./guarded-paths.ts";
import type { ReviewSource } from "./reviews.ts";
import { approversFile, type GitObjects } from "./signatures.ts";

/**
 * The guard's own paths and its approvers. Changing one needs a signed
 * `user-visible` note that lists it as written here, so an agent key alone
 * can't loosen the guard or add a signer (HAL-1337).
 */
export const ownPaths: readonly string[] = [...guardedPaths, approversFile];

/**
 * Own paths an `internal` note signed by the CTO key may cover (HAL-3434,
 * decided on HAL-7701): the board approved the user's GitHub review for
 * rare changes, and these folders change about 45 times a day. A change
 * under one still needs the user when it touches a path of `userPaths`.
 */
export const internalOwnPaths: readonly string[] = [".github/", "tooling/check/", ".gitattributes"];

/**
 * The files and folders inside `internalOwnPaths` that are the guard's real
 * trust roots: its note check, its code, the two guard commands and its
 * approvers. A change to one needs a `user-visible` note. A folder ends in `/`.
 */
export const userPaths: readonly string[] = [
  approversFile,
  ".github/workflows/guard-notes.yml",
  "tooling/check/src/guard/",
  "tooling/check/src/cli/guard-notes.ts",
  "tooling/check/src/cli/requirement-guard.ts",
];

/** One run of the note check: the pull request, its branch and changed files. */
export interface NoteCheckRun {
  readonly pull: PullRequest;
  readonly branch: string;
  /** The files the pull request changes, adds or deletes, from its merge base. */
  readonly changed: readonly string[];
  /** The commit `changed` is counted from, where `policy.json` is compared. */
  readonly mergeBase: string;
  readonly git: GitObjects;
  /** Reads the pull request's reviews, for a `user-visible` note with no signature. */
  readonly reviews?: ReviewSource | undefined;
}

/**
 * The note check that `guard-notes.yml` runs from the base branch: a
 * pull request that touches an own path needs a `user-visible` note listing
 * it, and any note it adds must be approved, by a valid signature or, for
 * a `user-visible` note, a GitHub review. A change to `policy.json` in `extraExports`
 * only needs a note that lists `policy.json`, of either kind. The
 * test-result comparison stays in the requirement guard.
 */
export async function checkNotes(run: NoteCheckRun): Promise<Report> {
  const report = new Report("guard-notes");
  const file = decisionNoteFile(run.branch);
  const { touched, exports } = touchedPaths(run);
  const text = run.git.readFile(run.pull.head, file);
  if (text === undefined) {
    for (const path of touched) {
      report.error(
        path,
        `Changes the guard's own path ${path}. That needs a signed decision note: add ${file} and list "${path}" under Covers.`,
      );
    }
    for (const path of exports) {
      report.error(
        path,
        `Changes extraExports in ${path}. That needs a signed note (internal is enough): add ${file} and list "${path}" under Covers.`,
      );
    }
    return report;
  }
  const parsed = parseDecisionNote(file, text);
  if (!parsed.ok) {
    for (const problem of parsed.problems) {
      report.error(file, `Malformed decision note: ${problem.message}`, problem.line);
    }
    return report;
  }
  const reachesUserPath = run.changed.some((each) => matches(userPaths, each));
  const needUser = touched.filter((path) => !internalOwnPaths.includes(path) || reachesUserPath);
  if (parsed.note.kind !== "user-visible" && needUser.length > 0) {
    report.error(
      file,
      `Changes the guard's own paths (${needUser.join(", ")}), so the note's Kind must be user-visible.`,
    );
  }
  const unlisted = (path: string): boolean => !parsed.note.covers.includes(path);
  for (const path of touched.filter(unlisted)) {
    report.error(
      file,
      `Changes the guard's own path ${path}, but the note doesn't list "${path}" under Covers.`,
    );
  }
  for (const path of exports.filter(unlisted)) {
    report.error(
      file,
      `Changes extraExports in ${path}, but the note doesn't list "${path}" under Covers.`,
    );
  }
  const verdict = await signedApprovals(run.pull, run.git, run.reviews).check({
    note: parsed.note,
  });
  if (!verdict.approved) {
    report.error(file, `The note's approval isn't verified: ${verdict.reason}.`);
  }
  return report;
}

/**
 * The own paths a pull request touches, which need a `user-visible` note,
 * and `policy.json` when it changes in `extraExports` only, which needs a
 * note of either kind.
 */
function touchedPaths(run: NoteCheckRun): { touched: string[]; exports: string[] } {
  const exportsOnly =
    run.changed.includes(policyFile) &&
    onlyExtraExportsChanged(
      run.git.readFile(run.mergeBase, policyFile),
      run.git.readFile(run.pull.head, policyFile),
    );
  const changed = exportsOnly ? run.changed.filter((path) => path !== policyFile) : run.changed;
  const touched = ownPaths.filter((path) => changed.some((each) => matches([path], each)));
  return { touched, exports: exportsOnly ? [policyFile] : [] };
}

/** Whether `file` is one of `paths`, or under one that ends in `/`. */
function matches(paths: readonly string[], file: string): boolean {
  return paths.some((path) => (path.endsWith("/") ? file.startsWith(path) : file === path));
}
