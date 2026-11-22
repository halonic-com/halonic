// The words of a run proposal's row (flow-inbox 2.2, microcopy 10.1,
// HAL-11945 Q1 and Q2), and of a window that can't decide proposals
// (HAL-15986). A proposal isn't an approval, so none of them says "approve".

import { shortRunId } from "@halonicjs/app";
import { markHiddenName } from "@halonicjs/std";
import type { ProposalEnding, ProposalFile, ProposalItem } from "../proposal-items.ts";
import { clockTime, endedAgo } from "./waiting-time.ts";

const endingVerbs: Readonly<Record<ProposalEnding, string>> = {
  finished: "Finished",
  failed: "Failed",
  stopped: "Stopped",
};

/**
 * The row's title: "Run 01JD8Q proposes 3 changes to Support triage", with more items "to Support
 * triage and 2 more". Item names come from workspace files, so hidden characters are marked.
 *
 * @example
 * proposalTitle(item); // "Run 01JD8Q proposes 1 change to Support triage"
 */
export function proposalTitle(item: ProposalItem): string {
  return `Run ${shortRunId(item.runId)} proposes ${changesCount(item.changes)}${toItems(item.itemNames)}`;
}

/** "1 change", "3 changes". */
function changesCount(count: number): string {
  return `${count} ${count === 1 ? "change" : "changes"}`;
}

function toItems(names: readonly string[]): string {
  const [first] = names;
  if (first === undefined) return "";
  const more = names.length > 1 ? ` and ${names.length - 1} more` : "";
  return ` to ${markHiddenName(first)}${more}`;
}

/**
 * The row's meta, read from the run's record (Q2): "Finished 2 h ago", "Failed 2 h ago" or
 * "Stopped 2 h ago"; "Ended 2 h ago" when the record can't be read.
 */
export function proposalMeta(item: ProposalItem, now: Date): string {
  const verb = item.ending === null ? "Ended" : endingVerbs[item.ending];
  return endedAgo(verb, new Date(item.since), now);
}

/**
 * The line under the open proposal's title (Q3): "Support triage · Finished at 06:12 · Started by
 * a schedule", each part left out when it isn't known.
 */
export function proposalFacts(
  item: ProposalItem,
  now: Date,
  facts: { readonly workflow: string; readonly startedBy: string } | undefined,
): string {
  const verb = item.ending === null ? "Ended" : endingVerbs[item.ending];
  const ended = `${verb} at ${clockTime(new Date(item.since), now)}`;
  if (facts === undefined) return ended;
  return [markHiddenName(facts.workflow), ended, `Started by ${facts.startedBy}`].join(" · ");
}

/**
 * The lines before any Accept (Q4): what accepting does and doesn't do, with first, for a run
 * that didn't finish, that its changes may be incomplete. Inside a sentence the run is "run
 * 01JD8Q" (flow-inbox revision 10).
 */
export function beforeAcceptLines(item: ProposalItem): readonly string[] {
  const run = shortRunId(item.runId);
  const outside = `Accepting changes the files. It doesn't take back or redo what run ${run} did outside them, such as messages it sent.`;
  if (item.ending === "finished") return [outside];
  return [`Run ${run} didn't finish, so these changes may be incomplete.`, outside];
}

/** The link after those lines: "See run 01JD8Q". */
export function seeRunText(runId: string): string {
  return `See run ${shortRunId(runId)}`;
}

const changeWords: Readonly<Record<ProposalFile["change"], string>> = {
  added: "added",
  modified: "changed",
  deleted: "deleted",
};

/** One change's line (Q5): "hubs/support/agents/triage.yaml changed". Paths come from the workspace. */
export function changeLine(file: ProposalFile): string {
  return `${markHiddenName(file.path)} ${changeWords[file.change]}`;
}

/** Under a change an Accept left alone, because the person changed the file after the run started. */
export function changedSinceRunLine(runId: string): string {
  return `You changed this file after run ${shortRunId(runId)} started, so it wasn't accepted.`;
}

/** The line when an Accept or a Reject didn't go through (Q11): "Couldn't accept this change." */
export function decisionFailedLine(verb: "accept" | "reject", all: boolean): string {
  return `Couldn't ${verb} ${all ? "these changes" : "this change"}.`;
}

/** The toast after an Accept or a Reject (Q7): "Accepted 3 changes from run 01JD8Q". */
export function decidedToast(verb: "Accepted" | "Rejected", count: number, runId: string): string {
  return `${verb} ${changesCount(count)} from run ${shortRunId(runId)}`;
}

/**
 * What the proposal came to once nothing is left to decide (Q8, Q10): "Accepted 2 of 3 changes ·
 * 1 can't be written", "Accepted 3 changes", or "Rejected".
 */
export function decidedSummary(files: readonly ProposalFile[]): string {
  const count = (decision: ProposalFile["decision"]) =>
    files.filter((file) => file.decision === decision).length;
  const accepted = count("accepted");
  const parts: string[] = [];
  if (accepted === files.length) parts.push(`Accepted ${changesCount(accepted)}`);
  else if (accepted > 0) parts.push(`Accepted ${accepted} of ${files.length} changes`);
  else if (count("rejected") > 0) parts.push("Rejected");
  const cantWrite = count("not-applicable");
  if (cantWrite > 0) parts.push(`${cantWrite} can't be written`);
  return parts.join(" · ");
}

/**
 * Under "Couldn't undo this." when the host left files of a decision as they were: "notes/a.md
 * changed after it was accepted, so it stays accepted." Paths come from the workspace.
 */
export function undoLeftAloneLine(verb: "accepted" | "rejected", paths: readonly string[]): string {
  const [only] = paths;
  if (paths.length === 1 && only !== undefined) {
    return `${markHiddenName(only)} changed after it was ${verb}, so it stays ${verb}.`;
  }
  return `${paths.length} files changed after they were ${verb}, so they stay ${verb}.`;
}

/**
 * On a proposal the window can't decide (no Accept or Reject here), the line before the command
 * that does it in a terminal, {@link decideCommand}.
 */
export const decideElsewhereLine =
  "Studio can't accept or reject these changes here. To see them and decide, run this in a terminal:";

/**
 * The command that shows a run's proposal with its diffs, and ends with how to accept or discard
 * it: "halonic proposals show 01JD8Q". The CLI takes the short id in either case.
 */
export function decideCommand(runId: string): string {
  return `halonic proposals show ${shortRunId(runId)}`;
}

/**
 * Under Needs you in a window that lists no proposals, a served Studio or a phone (HAL-15986):
 * the line around the command, which the page shows in code style.
 */
export const proposalsElsewhere = {
  before: "Changes your runs propose show only in the desktop app, or with",
  command: "halonic proposals",
  after: "in a terminal.",
};
