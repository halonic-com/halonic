// Turns what `loadWorkspace` found into the lines `halonic validate` prints
// (cli-output 3.2): the problems grouped by file, each with where it is, its
// mark, its sentence and its code, then the summary line last. Every word
// comes from the catalogue or from the problem itself; this file only decides
// the order, the cap and the columns.

import { sep } from "node:path";
import type { LoadedWorkspace, WorkspaceIssue } from "@halonicjs/workspace";
import { markPart, type Phrase, phrase } from "../messages/phrase.ts";
import { type ValidateCounts, validateMessages } from "../messages/validate.ts";
import { printable } from "./printable.ts";

/** How many problems the screen shows without `--all` (cli-output 3.2, as Biome). */
export const shownProblemsLimit = 20;

/** What `halonic validate` found in a workspace. */
export interface ValidateReport {
  /**
   * Every problem: errors first, then warnings, each in file path, line and
   * column order. This is the `--json` order, and the order the cap takes
   * them in, so errors fill the screen before warnings.
   */
  readonly problems: readonly WorkspaceIssue[];
  readonly counts: ValidateCounts;
}

/** How the lines are shown. */
export interface ValidateView {
  /** The workspace as the summary names it: "Checked 14 files in acme." */
  readonly workspace: string;
  /** The `--dir` the user gave, so the suggested `--all` command keeps it. */
  readonly dir?: string;
  /** `--all`: every problem, not only the first {@link shownProblemsLimit}. */
  readonly all: boolean;
  /** `--strict`: warnings fail too. */
  readonly strict: boolean;
}

/**
 * The problems of a loaded workspace in report order, and the counts for the
 * summary line.
 *
 * @example
 * validateReport(await loadWorkspace(store)).counts;
 * // { errors: 2, warnings: 1, filesWithProblems: 2, checked: 14 }
 */
export function validateReport(workspace: LoadedWorkspace): ValidateReport {
  const problems = [...workspace.issues].sort(errorsFirst);
  const errors = problems.filter((problem) => problem.severity === "error").length;
  // A file with an error isn't among the loaded files, but it was checked all the same.
  const checked = new Set([
    ...workspace.files.map((file) => file.path),
    ...problems.map((problem) => problem.file),
  ]);
  return {
    problems,
    counts: {
      errors,
      warnings: problems.length - errors,
      filesWithProblems: new Set(problems.map((problem) => problem.file)).size,
      checked: checked.size,
    },
  };
}

/** Whether the report fails the command: any error, or with `--strict` any warning too. */
export function validateFails(report: ValidateReport, strict: boolean): boolean {
  return report.counts.errors > 0 || (strict && report.counts.warnings > 0);
}

/**
 * The lines of `halonic validate`, in the order of cli-output 3.2: one block
 * per file in path order, its errors before its warnings, then the line
 * about hidden problems when the cap left some out, then the summary.
 *
 * @example
 * validateLines(report, { workspace: "acme", all: false, strict: false });
 * // ["hubs/support/agents/sorter.agent.yaml",
 * //  "  12:10  ✕ The model alias "smrt" isn't in models.yaml.  (unknown-alias)",
 * //  "", "✕ 1 error in 1 file. Checked 14 files."] (as phrases)
 */
export function validateLines(report: ValidateReport, view: ValidateView): Phrase[] {
  const { problems, counts } = report;
  if (problems.length === 0) {
    return [
      phrase`${markPart("done")} ${validateMessages.noProblems(counts.checked, view.workspace).phrase}`,
    ];
  }
  const shown = view.all ? problems : problems.slice(0, shownProblemsLimit);
  const hidden =
    shown.length < problems.length
      ? [validateMessages.hidden(shown.length, problems.length, view.dir).phrase]
      : [];
  return [
    ...byFile(shown).flatMap((block) => [...fileLines(block), []]),
    ...hidden,
    summaryLine(report, view),
  ];
}

/** The last line: ✕ with the counts when the command fails, else ✓ with the warnings. */
function summaryLine(report: ValidateReport, view: ValidateView): Phrase {
  const { counts } = report;
  if (validateFails(report, view.strict)) {
    return phrase`${markPart("failed")} ${validateMessages.found(counts).phrase}`;
  }
  const passed = validateMessages.onlyWarnings(counts.checked, view.workspace, counts.warnings);
  return phrase`${markPart("done")} ${passed.phrase}`;
}

/** The problems of one file, errors first, each in line order. */
interface FileBlock {
  readonly file: string;
  readonly problems: readonly WorkspaceIssue[];
}

/** The shown problems as one block per file, in path order. */
function byFile(problems: readonly WorkspaceIssue[]): FileBlock[] {
  const blocks = new Map<string, WorkspaceIssue[]>();
  for (const problem of problems) {
    const block = blocks.get(problem.file) ?? [];
    block.push(problem);
    blocks.set(problem.file, block);
  }
  return [...blocks.entries()]
    .sort(([a], [b]) => compareText(a, b))
    .map(([file, fileProblems]) => ({ file, problems: fileProblems }));
}

/**
 * The file as its heading, then one line per problem. The line numbers are
 * right-aligned and the columns left-aligned, so the colons line up within
 * the file: "  40:13  ✕" over "   8:3   !".
 */
function fileLines({ file, problems }: FileBlock): Phrase[] {
  const lineWidth = widest(problems.map((problem) => problem.line));
  const colWidth = widest(problems.map((problem) => problem.col));
  return [
    [printable(shownFile(file))],
    ...problems.map((problem) => {
      const before = " ".repeat(lineWidth - String(problem.line).length);
      const after = " ".repeat(colWidth - String(problem.col).length);
      const where = validateMessages.where(problem.line, problem.col).phrase;
      const mark = markPart(problem.severity === "error" ? "failed" : "needsYou");
      const code = validateMessages.code(printable(problem.code)).phrase;
      return phrase`  ${before}${where}${after}  ${mark} ${printable(problem.message)}  ${code}`;
    }),
  ];
}

/** A workspace path, which always has `/`, with the system's separator, as the user would type it. */
function shownFile(file: string): string {
  return file.split("/").join(sep);
}

/** How many digits the largest number has. */
function widest(numbers: readonly number[]): number {
  return Math.max(...numbers.map((number) => String(number).length));
}

function errorsFirst(a: WorkspaceIssue, b: WorkspaceIssue): number {
  return (
    severityRank(a) - severityRank(b) ||
    compareText(a.file, b.file) ||
    a.line - b.line ||
    a.col - b.col
  );
}

function severityRank(problem: WorkspaceIssue): number {
  return problem.severity === "error" ? 0 : 1;
}

/** Path order that is the same on every computer, whatever its locale. */
function compareText(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}
