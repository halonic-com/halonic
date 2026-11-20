import { counted, listInWords } from "./counts.ts";
import { defineMessages } from "./define.ts";
import { dim, phrase } from "./phrase.ts";
import { suggestedCommand } from "./suggested-command.ts";

/** How a run changed a file, as `show` heads it. */
export type ShownChange = "added" | "modified" | "deleted";

/** Where a proposed file stands, as `show` heads it. */
export type ShownDecision = "undecided" | "accepted" | "discarded" | "cantWrite";

/**
 * What `show` prints after a text's last line when it has no newline, so a
 * change to only that is seen. Git's own words, kept as git writes them so
 * the diff reads like `git diff`.
 */
export const noNewlineMarker = "\\ No newline at end of file";

const decisionWords: Readonly<Record<ShownDecision, string>> = {
  undecided: "",
  accepted: "accepted",
  discarded: "discarded",
  cantWrite: "can't be written",
};

/**
 * `halonic proposals`: what agents' runs propose to change in the workspace,
 * and accepting or discarding it (HAL-6477, board yes on HAL-9332). Nothing
 * changes in the person's files until they accept.
 */
export const proposalsMessages = defineMessages("proposals", {
  summary: () => phrase`See what agents' runs propose to change, and accept or discard it`,
  action: (workspace: string) => phrase`list the proposals in ${workspace}`,
  showSummary: () => phrase`Show what one run proposes, file by file`,
  showAction: (runId: string) => phrase`show the proposal of run ${runId}`,
  acceptSummary: () => phrase`Write a run's proposed changes to your files`,
  acceptAction: (runId: string) => phrase`accept the proposal of run ${runId}`,
  discardSummary: () => phrase`Drop a run's proposed changes; your files stay as they are`,
  discardAction: (runId: string) => phrase`discard the proposal of run ${runId}`,

  /** After `halonic run`, when the run left a proposal: nothing in the files changed yet. */
  waiting: (runId: string, files: number, dir?: string) =>
    phrase`Run ${runId} proposes changes to ${counted(files, "file", "files")}. Nothing in your files changed yet: see them with ${suggestedCommand("proposals show", dir, runId)}.`,
  /** The list is empty. */
  noProposals: (workspace: string) => phrase`No run in ${workspace} has changes waiting for you.`,
  /** One row's file count: "2 files, 1 left". */
  filesLeft: (files: number, left: number) =>
    left === files
      ? phrase`${counted(files, "file", "files")}`
      : phrase`${counted(files, "file", "files")}, ${left} left`,
  /** The line under the list. */
  seeOne: (dir?: string) =>
    phrase`See one with ${suggestedCommand("proposals show", dir, "<run-id>")}.`,

  /** `show`'s heading: "Run a1b2c3 proposes changes to 2 files in Acme." */
  heading: (runId: string, files: number, workspace: string) =>
    phrase`Run ${runId} proposes changes to ${counted(files, "file", "files")} in ${workspace}.`,
  /** One file's heading: "modified  agents/clerk.agent.yaml  (accepted)". */
  fileHeading: (change: ShownChange, path: string, decision: ShownDecision) =>
    decision === "undecided"
      ? phrase`${change}  ${path}`
      : phrase`${change}  ${path}  ${dim(`(${decisionWords[decision]})`)}`,
  /** Under a file someone changed since the run: Accept leaves it alone. */
  changedSince: () =>
    phrase`  This file changed since the run, so accept won't write it. The diff is from your file now.`,
  /** The diff of a file that is the same as the run's text. */
  noDifference: () => phrase`  Your file already has these changes.`,
  /** How to decide, under `show`. */
  howToDecide: (runId: string, dir?: string) =>
    phrase`Accept with ${suggestedCommand("proposals accept", dir, runId)}, or discard with ${suggestedCommand("proposals discard", dir, runId)}.`,

  /** `accept`: the files written. */
  wrote: (paths: readonly string[]) =>
    phrase`Wrote ${counted(paths.length, "file", "files")}: ${listInWords(paths)}.`,
  /** `accept` that wrote nothing. */
  wroteNothing: () => phrase`No file was written.`,
  /** Files the person changed since the run: they stay undecided. */
  changedOnDisk: (paths: readonly string[]) =>
    phrase`${listInWords(paths)} changed since the run, so ${paths.length === 1 ? "it wasn't" : "they weren't"} written. Edit by hand, or discard.`,
  /** The `--json` error when a file changed since the run (`conflict`). */
  changedOnDiskFailure: () => phrase`Some files changed since the run, so they weren't written.`,
  /** Files Accept may never write. */
  cantWrite: (paths: readonly string[]) =>
    phrase`${listInWords(paths)} can't be written: Halonic never writes inside .git or .halonic.`,
  /** `discard`. */
  discarded: (files: number) =>
    phrase`Discarded the changes to ${counted(files, "file", "files")}. Your files stay as they are.`,
  /** Nothing left to decide: the proposal is closed. */
  done: (runId: string) => phrase`Run ${runId}'s proposal is done.`,
  /** Some files are still to decide. */
  stillLeft: (left: number, runId: string, dir?: string) =>
    phrase`${counted(left, "file is", "files are")} still to decide: ${suggestedCommand("proposals show", dir, runId)}.`,
  /** A proposal whose texts were deleted outside Halonic was removed by discard. */
  removedUnavailable: (runId: string) =>
    phrase`Removed run ${runId}'s proposal: its changes were deleted outside Halonic.`,

  /** No open proposal for the id typed (`not_found`). */
  noProposal: (runId: string, workspace: string) =>
    phrase`No changes from run ${runId} are waiting in ${workspace}.`,
  noProposalFix: (dir?: string) =>
    phrase`See the proposals with ${suggestedCommand("proposals", dir)}.`,
  /** Two proposals end in the short id (`invalid_input`). */
  severalProposals: (shortId: string, workspace: string) =>
    phrase`Two proposals in ${workspace} end in ${shortId}.`,
  severalProposalsFix: (dir?: string) =>
    phrase`Use the full id, as ${suggestedCommand("proposals", dir, "--json")} shows it.`,
  /** A file the proposal doesn't change (`not_found`). */
  noFile: (path: string, runId: string) => phrase`Run ${runId} proposes no change to ${path}.`,
  noFileFix: (runId: string, dir?: string) =>
    phrase`See its files with ${suggestedCommand("proposals show", dir, runId)}.`,
  /** The proposal's texts are gone (`unavailable`). */
  unavailable: (runId: string) =>
    phrase`Run ${runId}'s changes were deleted outside Halonic, so they can't be shown or accepted.`,
  unavailableFix: (runId: string, dir?: string) =>
    phrase`Remove the proposal with ${suggestedCommand("proposals discard", dir, runId)}.`,
  /** Usage: `show`, `accept` and `discard` take one run id, and a file for the last two. */
  takesOneRunId: () => phrase`Give one run id.`,
  takesRunIdAndFile: () => phrase`Give one run id, and a file if you want to decide only that one.`,
});
