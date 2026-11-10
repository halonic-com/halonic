import { counted } from "./counts.ts";
import { defineMessages } from "./define.ts";
import { bold, dim, type Phrase, phrase } from "./phrase.ts";
import { suggestedCommand } from "./suggested-command.ts";

/** What `validate` found, for its summary line. */
export interface ValidateCounts {
  readonly errors: number;
  readonly warnings: number;
  /** How many files have a problem. */
  readonly filesWithProblems: number;
  /** How many files were checked. */
  readonly checked: number;
}

/**
 * The sentences of `halonic validate [--dir <folder>]` (cli-output 1.9 and
 * 3.2). A problem's own sentence and fix come from its `LoadProblem`, so the
 * only words here are the frame around the problems. The marks, the file
 * headings and the columns are the printer's.
 */
export const validateMessages = defineMessages("validate", {
  summary: () => phrase`Check a workspace's files and say what to fix`,
  /** What `validate` was doing, for "✕ Couldn't check ./downloads: …". */
  action: (folder: string) => phrase`check ${folder}`,

  noProblems: (checked: number, workspace: string) =>
    phrase`Checked ${counted(checked, "file", "files")} in ${workspace}. No problems.`,
  /** Warnings alone pass, with a ✓ and exit 0. */
  onlyWarnings: (checked: number, workspace: string, warnings: number) =>
    phrase`Checked ${counted(checked, "file", "files")} in ${workspace}. ${counted(warnings, "warning", "warnings")}.`,
  /** The last line when there are errors: "2 errors and 1 warning in 2 files. Checked 14 files." */
  found: (counts: ValidateCounts) =>
    phrase`${foundProblems(counts)} in ${counted(counts.filesWithProblems, "file", "files")}. Checked ${counted(counts.checked, "file", "files")}.`,
  /** Above the summary when more than 20 problems were found; `dir` is the user's own `--dir`. */
  hidden: (shown: number, total: number, dir?: string) =>
    phrase`Showing the first ${shown} of ${total} problems. Run ${suggestedCommand("validate", dir, "--all")} to see them all.`,
  /** Where a problem is in its file, "12:10", dimmed in front of its mark. */
  where: (line: number, column: number) => [dim(`${line}:${column}`)],
  /** A problem's code, last on its line and dimmed: "(unknown-alias)". */
  code: (code: string) => [dim(`(${code})`)],

  /** The reason when the folder has no workspace in it. */
  noWorkspace: () => phrase`there's no workspace.yaml here.`,
  noWorkspaceFix: () => phrase`Run it inside a workspace, or create one with halonic init.`,
});

/** "2 errors and 1 warning", with the errors in bold as the number that matters. */
function foundProblems(counts: ValidateCounts): Phrase {
  const errors = counted(counts.errors, "error", "errors");
  const warnings = counted(counts.warnings, "warning", "warnings");
  if (counts.warnings === 0) {
    return [bold(errors)];
  }
  if (counts.errors === 0) {
    return phrase`${warnings}`;
  }
  return phrase`${bold(errors)} and ${warnings}`;
}
