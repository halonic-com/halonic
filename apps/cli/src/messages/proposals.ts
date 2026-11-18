import { counted } from "./counts.ts";
import { defineMessages } from "./define.ts";
import { dim, phrase } from "./phrase.ts";
import { suggestedCommand } from "./suggested-command.ts";

/** How a run changed a file, as `show` heads it. */
export type ShownChange = "added" | "modified" | "deleted";

/** Where a proposed file stands, as `show` heads it. */
export type ShownDecision = "undecided" | "accepted" | "discarded" | "cantWrite";

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
  /** The proposal's texts are gone (`unavailable`). */
  unavailable: (runId: string) =>
    phrase`Run ${runId}'s changes were deleted outside Halonic, so they can't be shown or accepted.`,
  /** Usage: `show` takes one run id. */
  takesOneRunId: () => phrase`Give one run id.`,
});
