import { Report } from "../lib/problems.ts";
import { type PullRequest, signedApprovals } from "./approvals.ts";
import { decisionNoteFile, parseDecisionNote } from "./decision-notes.ts";
import { guardedPaths } from "./guarded-paths.ts";
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
  readonly git: GitObjects;
}

/**
 * The note check that `guard-notes.yml` runs from the base branch: a
 * pull request that touches an own path needs a note listing it (`user-visible`,
 * or `internal` for the paths in `internalOwnPaths`), and any note it adds
 * must carry a valid signature. The test-result comparison stays in the
 * requirement guard.
 */
export async function checkNotes(run: NoteCheckRun): Promise<Report> {
  const report = new Report("guard-notes");
  const file = decisionNoteFile(run.branch);
  const touched = ownPaths.filter((path) =>
    run.changed.some((changed) =>
      path.endsWith("/") ? changed.startsWith(path) : changed === path,
    ),
  );
  const text = run.git.readFile(run.pull.head, file);
  if (text === undefined) {
    for (const path of touched) {
      report.error(
        path,
        `Changes the guard's own path ${path}. That needs a signed decision note: add ${file} and list "${path}" under Covers.`,
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
  for (const path of touched.filter((own) => !parsed.note.covers.includes(own))) {
    report.error(
      file,
      `Changes the guard's own path ${path}, but the note doesn't list "${path}" under Covers.`,
    );
  }
  const verdict = await signedApprovals(run.pull, run.git).check({ note: parsed.note });
  if (!verdict.approved) {
    report.error(file, `The note's approval isn't verified: ${verdict.reason}.`);
  }
  return report;
}
