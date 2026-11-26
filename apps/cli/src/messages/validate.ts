import { counted } from "./counts.ts";
import { defineMessages } from "./define.ts";
import { providerFileDocs } from "./docs.ts";
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
  /** The help line of `--all`. */
  allOption: () => phrase`Show every problem, not only the first 20.`,
  /** The help line of `--strict`. */
  strictOption: () => phrase`Fail on warnings too, not only on errors.`,
  /**
   * The fix for a folder given without `--dir` (HAL-12639): `validate`
   * checks only workspaces, and `plugin add` reports a plugin's manifest errors.
   */
  folderWithoutDir: (folder: string) =>
    phrase`To check the workspace in ${folder}, run ${suggestedCommand("validate", folder)}. For a plugin folder, run halonic plugin add ${folder}.`,

  /**
   * A connector or provider file the trust check refuses, in its words, such
   * as "the address has a user name or password in it" (HAL-16276). Never
   * the address, which may hold a password.
   */
  trustRefused: (reason: string) =>
    phrase`This file can't be trusted, because ${reason}. Fix the address, and keep any password or key as a secret instead.`,

  /**
   * An agent whose harness can't call its model alias's provider (HAL-18930),
   * with the Model page's sentence for that harness (flow 5.6, UX 2.5).
   */
  harnessModelRefused: (agent: string, model: string, harness: string) =>
    phrase`Agent ${agent} names model ${model}. ${harnessRefusal(harness)}`,
  /** A Codex agent on an OpenAI-compatible provider (HAL-18930, flow 5.6). */
  harnessEndpoint: (agent: string, provider: string) =>
    phrase`Agent ${agent} runs in Codex on provider ${provider}. Make sure this endpoint supports the Responses API.`,

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
  /**
   * Above the summary when a shown problem says to add a provider file: what goes in one, since
   * no command writes it and the workspace may hold only the test model's (C638, HAL-15830).
   */
  providerFile: () => phrase`What goes in a provider file, with an example: ${providerFileDocs}`,
  /** Where a problem is in its file, "12:10", dimmed in front of its mark. */
  where: (line: number, column: number) => [dim(`${line}:${column}`)],
  /** A problem's code, last on its line and dimmed: "(unknown-alias)". */
  code: (code: string) => [dim(`(${code})`)],
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

/**
 * Why the harness can't use the model, in the Model page's words (flow 5.6, UX 2.5), with what to
 * do: Claude Code and OpenCode call Anthropic's API only, Codex OpenAI's Responses API only.
 */
function harnessRefusal(harness: string): string {
  switch (harness) {
    case "codex":
      return "This model can't be used with Codex. Choose another.";
    case "opencode":
      return "OpenCode can use Anthropic models only. Choose another.";
    default:
      return "Claude Code can use Anthropic models only. Choose another.";
  }
}
