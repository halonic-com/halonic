import { Report } from "../lib/problems.ts";
import { type PullRequest, signedApprovals } from "./approvals.ts";
import { decisionNoteFile, parseDecisionNote } from "./decision-notes.ts";
import { guardedPaths, onlyExtraExportsChanged, policyFile } from "./guarded-paths.ts";
import { approversFile, type GitObjects } from "./signatures.ts";

/**
 * The guard's own paths and its approvers. Changing one needs a signed
 * `user-visible` note that lists it as written here, so an agent key alone
 * can't loosen the guard or add a signer (HAL-1337).
 */
export const ownPaths: readonly string[] = [...guardedPaths, approversFile];

/**
 * Own paths an `internal` note signed by the CTO key may cover, until the
 * board pins a user key (HAL-3434). Everything else in `ownPaths`, with the
 * approvers file, still needs a `user-visible` note.
 */
export const internalOwnPaths: readonly string[] = [".github/", "tooling/check/", ".gitattributes"];

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
 * pull request that touches an own path needs a note listing it (`user-visible`,
 * or `internal` for the paths in `internalOwnPaths`), and any note it adds
 * must carry a valid signature. A change to `policy.json` in `extraExports`
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
  const needUser = touched.filter((path) => !internalOwnPaths.includes(path));
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
  const verdict = await signedApprovals(run.pull, run.git).check({ note: parsed.note });
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
  const touched = ownPaths.filter((path) =>
    changed.some((each) => (path.endsWith("/") ? each.startsWith(path) : each === path)),
  );
  return { touched, exports: exportsOnly ? [policyFile] : [] };
}
