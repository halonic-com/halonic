import { Report } from "../lib/problems.ts";
import { type PullRequest, signedApprovals } from "./approvals.ts";
import { decisionNoteFile, parseDecisionNote } from "./decision-notes.ts";
import { guardDependencyChanged, guardDependencyFiles } from "./guard-dependencies.ts";
import { guardedPaths, onlyExtraExportsChanged, policyFile } from "./guarded-paths.ts";
import { approversFile, type GitObjects } from "./signatures.ts";

/**
 * The guard's own paths and its approvers. Changing one needs a signed
 * `user-visible` note that lists it as written here, so an agent key alone
 * can't loosen the guard or add a signer (HAL-1337).
 */
export const ownPaths: readonly string[] = [...guardedPaths, approversFile];

/**
 * Own paths an `internal` note signed by the CTO key may cover (decided on
 * HAL-7701): these folders change about 45 times a day. A change under one
 * still needs two guardians when it touches a path of `trustRoots`.
 */
export const internalOwnPaths: readonly string[] = [".github/", "tooling/check/", ".gitattributes"];

/**
 * The files and folders inside `internalOwnPaths` that are the guard's
 * trust roots: its note check, its code, the two guard commands, the `lib/`
 * helpers they import, the `package.json` that pins the one package they
 * load (the TypeScript parser), its approvers, `.gitattributes` and `policy.json`
 * (outside `extraExports`). A change to one needs a `user-visible` note
 * with the signatures of two different guardians (HAL-1337, HAL-7740). A
 * folder ends in `/`.
 */
export const trustRoots: readonly string[] = [
  approversFile,
  ".gitattributes",
  policyFile,
  ".github/workflows/guard-notes.yml",
  "tooling/check/package.json",
  "tooling/check/src/guard/",
  "tooling/check/src/cli/guard-notes.ts",
  "tooling/check/src/cli/requirement-guard.ts",
  // The helpers the two guard commands import from `lib/`: a change to one of
  // them could switch the guard off. A test walks the imports to keep this
  // list whole.
  "tooling/check/src/lib/bundle.ts",
  "tooling/check/src/lib/config-files.ts",
  "tooling/check/src/lib/context.ts",
  "tooling/check/src/lib/layout.ts",
  "tooling/check/src/lib/problems.ts",
  "tooling/check/src/lib/requirements.ts",
  "tooling/check/src/lib/source-files.ts",
  "tooling/check/src/lib/source-paths.ts",
  "tooling/check/src/lib/test-results.ts",
  "tooling/check/src/lib/verifies-calls.ts",
  "tooling/check/src/lib/workspace.ts",
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
}

/**
 * The note check that `guard-notes.yml` runs from the base branch: a
 * pull request that touches an own path needs a `user-visible` note listing
 * it, and any note it adds must carry a valid signature, two different
 * guardians' for a change to a trust root. A change to `policy.json` in `extraExports`
 * only needs a note that lists `policy.json`, of either kind. The
 * test-result comparison stays in the requirement guard.
 */
export async function checkNotes(run: NoteCheckRun): Promise<Report> {
  const report = new Report("guard-notes");
  const file = decisionNoteFile(run.branch);
  const { touched, exports, changed } = touchedPaths(run);
  const dependencies = guardDependencyFilesChanged(run);
  const text = run.git.readFile(run.pull.head, file);
  if (text === undefined) {
    reportMissingNote(report, file, { touched, exports, dependencies });
    return report;
  }
  const parsed = parseDecisionNote(file, text);
  if (!parsed.ok) {
    for (const problem of parsed.problems) {
      report.error(file, `Malformed decision note: ${problem.message}`, problem.line);
    }
    return report;
  }
  const reachesRoot = changed.some((each) => matches(trustRoots, each));
  const needUser = touched.filter((path) => !internalOwnPaths.includes(path) || reachesRoot);
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
  for (const path of dependencies.filter(unlisted)) {
    report.error(
      file,
      `Changes the entries for the npm package the guard runs in ${path}, but the note doesn't list "${path}" under Covers.`,
    );
  }
  const verdict = await signedApprovals(run.pull, run.git).check({
    note: parsed.note,
    guardians: reachesRoot,
  });
  if (!verdict.approved) {
    report.error(file, `The note's approval isn't verified: ${verdict.reason}.`);
  }
  return report;
}

/** The errors for a pull request that needs a note and has none. */
function reportMissingNote(
  report: Report,
  file: string,
  paths: { touched: string[]; exports: string[]; dependencies: string[] },
): void {
  for (const path of paths.touched) {
    report.error(
      path,
      `Changes the guard's own path ${path}. That needs a signed decision note: add ${file} and list "${path}" under Covers.`,
    );
  }
  for (const path of paths.exports) {
    report.error(
      path,
      `Changes extraExports in ${path}. That needs a signed note (internal is enough): add ${file} and list "${path}" under Covers.`,
    );
  }
  for (const path of paths.dependencies) {
    report.error(
      path,
      `Changes the entries for the npm package the guard runs in ${path}. That needs a signed note (internal is enough): add ${file} and list "${path}" under Covers.`,
    );
  }
}

/**
 * The own paths a pull request touches, which need a `user-visible` note,
 * and `policy.json` when it changes in `extraExports` only, which needs a
 * note of either kind.
 */
function touchedPaths(run: NoteCheckRun): {
  touched: string[];
  exports: string[];
  changed: readonly string[];
} {
  const exportsOnly =
    run.changed.includes(policyFile) &&
    onlyExtraExportsChanged(
      run.git.readFile(run.mergeBase, policyFile),
      run.git.readFile(run.pull.head, policyFile),
    );
  const changed = exportsOnly ? run.changed.filter((path) => path !== policyFile) : run.changed;
  const touched = ownPaths.filter((path) => changed.some((each) => matches([path], each)));
  return { touched, exports: exportsOnly ? [policyFile] : [], changed };
}

/**
 * The files whose lines for the npm package the guard runs changed, which
 * need a note of either kind (HAL-7719), compared at the merge base.
 */
function guardDependencyFilesChanged(run: NoteCheckRun): string[] {
  return guardDependencyFiles.filter(
    (file) =>
      run.changed.includes(file) &&
      guardDependencyChanged(
        file,
        run.git.readFile(run.mergeBase, file),
        run.git.readFile(run.pull.head, file),
      ),
  );
}

/** Whether `file` is one of `paths`, or under one that ends in `/`. */
function matches(paths: readonly string[], file: string): boolean {
  return paths.some((path) => (path.endsWith("/") ? file.startsWith(path) : file === path));
}
