import { Report } from "../lib/problems.ts";
import { type PullRequest, signedApprovals } from "./approvals.ts";
import {
  type DecisionNote,
  type DecisionNoteProblem,
  decisionNoteFile,
  parseDecisionNote,
} from "./decision-notes.ts";
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
  "tooling/check/src/lib/affected-tests.ts",
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
 * only needs a note that lists `policy.json`, of either kind. A change to
 * or deletion of a note already on the base branch needs a `user-visible`
 * note that lists each such path. The test-result comparison stays in the requirement guard.
 */
export async function checkNotes(run: NoteCheckRun): Promise<Report> {
  const report = new Report("guard-notes");
  const file = decisionNoteFile(run.branch);
  for (const path of strayNotes(run, file)) {
    report.error(
      path,
      `${path} isn't this branch's note; rename it to ${file}. Only that file is checked and signed.`,
    );
  }
  const { touched, exports, changed } = touchedPaths(run);
  const ownChanges = ownChangeList(touched, exports, guardDependencyFilesChanged(run));
  const text = run.git.readFile(run.pull.head, file);
  const rewritten = rewrittenNotes(run);
  if (text === undefined) {
    for (const path of rewritten) {
      report.error(path, rewrittenWithoutNote(path, file));
    }
    for (const { path, what, need } of ownChanges) {
      report.error(
        path,
        `${what}. That needs ${need}: add ${file} and list "${path}" under Covers.`,
      );
    }
    return report;
  }
  const parsed = parseDecisionNote(file, text);
  if (!parsed.ok) {
    reportMalformed(report, file, parsed.problems);
    return report;
  }
  const reachesRoot = changed.some((each) => isTrustRoot(each));
  const needUser = touched.filter((path) => !internalOwnPaths.includes(path) || reachesRoot);
  if (parsed.note.kind !== "user-visible" && needUser.length > 0) {
    report.error(
      file,
      `Changes the guard's own paths (${needUser.join(", ")}), so the note's Kind must be user-visible.`,
    );
  }
  for (const message of rewrittenNoteProblems(rewritten, parsed.note)) {
    report.error(file, message);
  }
  for (const { path, what } of ownChanges) {
    if (!parsed.note.covers.includes(path)) {
      report.error(file, `${what}, but the note doesn't list "${path}" under Covers.`);
    }
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

/** One own-path change the note must cover: the path, what changed, and what kind of note it needs. */
interface OwnChange {
  readonly path: string;
  readonly what: string;
  readonly need: string;
}

/** The paths the guard watches, in report order: own paths, `extraExports`, then the npm package's entries. */
function ownChangeList(
  touched: readonly string[],
  exports: readonly string[],
  dependencies: readonly string[],
): OwnChange[] {
  const internal = "a signed note (internal is enough)";
  return [
    ...touched.map((path) => ({
      path,
      what: `Changes the guard's own path ${path}`,
      need: "a signed decision note",
    })),
    ...exports.map((path) => ({ path, what: `Changes extraExports in ${path}`, need: internal })),
    ...dependencies.map((path) => ({
      path,
      what: `Changes the entries for the npm package the guard runs in ${path}`,
      need: internal,
    })),
  ];
}

/** The folder of decision notes. */
export const decisionsFolder = "decisions/";

/**
 * The notes under `decisions/` that the pull request edits or deletes and
 * that the base branch already has. Notes on base are append-only: they are the
 * record of what was approved. This includes a note at the branch's own path
 * when base already has it, since a branch name can repeat an old one. A
 * rename counts as a delete of the old path.
 */
function rewrittenNotes(run: NoteCheckRun): string[] {
  return run.changed.filter(
    (path) =>
      path.startsWith(decisionsFolder) && run.git.readFile(run.mergeBase, path) !== undefined,
  );
}

function reportMalformed(
  report: Report,
  file: string,
  problems: readonly DecisionNoteProblem[],
): void {
  for (const problem of problems) {
    report.error(file, `Malformed decision note: ${problem.message}`, problem.line);
  }
}

/** The error for a rewritten note on base when the branch has no note at all. */
function rewrittenWithoutNote(path: string, file: string): string {
  return `Edits or deletes ${path}, a decision note already on the base branch. Notes on base are append-only: add ${file} and list "${path}" under Covers to change one.`;
}

/**
 * What is wrong with the note's cover for the notes on base that the pull
 * request rewrites: each one must be listed by path, so the signature
 * covers its object at the head (or "missing" for a deletion).
 */
function rewrittenNoteProblems(rewritten: readonly string[], note: DecisionNote): string[] {
  const problems = rewritten
    .filter((path) => !note.covers.includes(path))
    .map(
      (path) =>
        `Edits or deletes ${path}, a decision note already on the base branch, but the note doesn't list "${path}" under Covers.`,
    );
  if (rewritten.length > 0 && note.kind !== "user-visible") {
    problems.push(
      `Edits or deletes decision notes already on the base branch (${rewritten.join(", ")}), so the note's Kind must be user-visible.`,
    );
  }
  return problems;
}

/**
 * The files the pull request adds under `decisions/` other than the branch's
 * note. No check reads them, so they could carry an unsigned note. Notes
 * already on the base branch stay as they are.
 */
function strayNotes(run: NoteCheckRun, file: string): string[] {
  return run.changed.filter(
    (path) =>
      path.startsWith("decisions/") &&
      path !== file &&
      run.git.readFile(run.pull.head, path) !== undefined &&
      run.git.readFile(run.mergeBase, path) === undefined,
  );
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
  const { changed, exportsOnly } = withoutExportsOnlyPolicy(
    run.changed,
    run.git.readFile(run.mergeBase, policyFile),
    run.git.readFile(run.pull.head, policyFile),
  );
  const touched = ownPaths.filter((path) => changed.some((each) => matches([path], each)));
  return { touched, exports: exportsOnly ? [policyFile] : [], changed };
}

/**
 * `changed` without `policy.json` when it changed in `extraExports` only,
 * and whether it did. One rule for the note check and the requirement guard.
 */
function withoutExportsOnlyPolicy(
  changed: readonly string[],
  basePolicy: string | undefined,
  headPolicy: string | undefined,
): { changed: readonly string[]; exportsOnly: boolean } {
  const exportsOnly =
    changed.includes(policyFile) && onlyExtraExportsChanged(basePolicy, headPolicy);
  return {
    changed: exportsOnly ? changed.filter((path) => path !== policyFile) : changed,
    exportsOnly,
  };
}

/**
 * Whether a change reaches a trust root, so its note needs the guardians'
 * signatures. A change to `policy.json` in `extraExports` only doesn't
 * (HAL-8163).
 */
export function reachesTrustRoot(
  changed: readonly string[],
  basePolicy: string | undefined,
  headPolicy: string | undefined,
): boolean {
  return withoutExportsOnlyPolicy(changed, basePolicy, headPolicy).changed.some(isTrustRoot);
}

/** Whether `file` is a trust root, or under one that ends in `/`. */
export function isTrustRoot(file: string): boolean {
  return matches(trustRoots, file);
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
