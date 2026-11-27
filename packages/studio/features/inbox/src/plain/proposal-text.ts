// The words of a run proposal's row (flow-inbox 2.2, microcopy 10.1,
// HAL-11945 Q1 and Q2), and of a window that can't decide proposals
// (HAL-15986). A proposal isn't an approval, so none of them says "approve".

import { shortRunId } from "@halonicjs/app";
import { markHiddenName } from "@halonicjs/std";
import { clockTime, endedAgo } from "@halonicjs/studio-kit";
import type { ProposalFailure } from "../proposal-decisions.ts";
import type { ProposalEnding, ProposalFile, ProposalItem } from "../proposal-items.ts";

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
  facts: { readonly workflow: string; readonly startedBy?: string | undefined } | undefined,
): string {
  const verb = item.ending === null ? "Ended" : endingVerbs[item.ending];
  const ended = `${verb} at ${clockTime(new Date(item.since), now)}`;
  if (facts === undefined) return ended;
  const started = facts.startedBy === undefined ? [] : [`Started by ${facts.startedBy}`];
  return [markHiddenName(facts.workflow), ended, ...started].join(" · ");
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

/**
 * Under a change an Accept left alone, because the file changed after the run started (C665 26, Q9).
 * The host knows only that it changed, not who changed it, as the CLI's "changed since the run".
 */
export function changedSinceRunLine(runId: string): string {
  return `This file changed after run ${shortRunId(runId)} started. Accept opens Compare.`;
}

/** The words of Compare (Q9), on a file that changed after the run started. */
export const compareWords = {
  /** Its name, read when it opens: "Compare notes.md". */
  name: (path: string) => `Compare ${markHiddenName(path)}`,
  loading: "Loading both texts",
  loadFailed: "Couldn't open Compare.",
  chooseFailed: "Couldn't apply your choice.",
  yours: "Yours",
  runs: (runId: string) => `Run ${shortRunId(runId)}'s`,
  /** In place of a text when there is no file: the person or the run deleted it. */
  none: "No file",
  keepMine: "Keep mine",
  useRuns: "Use the run's",
  combineBoth: "Combine both",
  cancel: "Cancel",
  /** Closes Compare when it couldn't open; Cancel is the choice that leaves the file undecided. */
  close: "Close",
  tryAgain: "Try again",
} as const;

/** When the file was saved again after Compare showed it, so nothing was written. */
export const changedAgainLine =
  "This file changed after Compare opened, so nothing was written. Here it is now.";

/** The line when an Accept or a Reject didn't go through (Q11): "Couldn't accept this change." */
export function decisionFailedLine(verb: "accept" | "reject", all: boolean): string {
  return `Couldn't ${verb} ${all ? "these changes" : "this change"}.`;
}

/**
 * Why an Accept, a Reject or an Undo didn't go through (C665 27), after {@link decisionFailedLine}
 * or under "Couldn't undo this.", by why, never by the host's own text. Only a Remove finds the
 * changes there again, so for these that is a reason Halonic can't explain.
 */
export function decisionFailureReason(failure: ProposalFailure): string {
  return decisionFailureReasons[failure];
}

const unexplainedReason = "Halonic ran into a problem it can't explain yet.";

/** The workspace's trust check refused it: the host was never asked. */
export const untrustedDecisionLine =
  "This workspace isn't trusted yet, so Halonic can't change its files.";

const decisionFailureReasons: Readonly<Record<ProposalFailure, string>> = {
  "changes-back": unexplainedReason,
  "not-answering": "The engine isn't answering. It may still be starting.",
  untrusted: untrustedDecisionLine,
  unexplained: unexplainedReason,
};

/**
 * In place of the buttons once the run's changes are gone (Q11, C681 31), before
 * {@link removeLabel}. The CLI says the same sentence.
 */
export function goneLine(runId: string): string {
  return `Run ${shortRunId(runId)}'s changes were deleted outside Halonic, so they can't be shown or accepted.`;
}

/**
 * Above the changes once a **Remove from Inbox** found them there again and the page read them
 * (C711 4): nothing failed for the person, so it isn't a danger line.
 */
export function changesBackLine(runId: string): string {
  return `Run ${shortRunId(runId)}'s changes are there again. Review them below.`;
}

/** The button that takes a run whose changes are gone out of Needs you; nothing on disk changes. */
export const removeLabel = "Remove from Inbox";

/** The toast once it is removed: "Removed run 01JD8Q from the Inbox". */
export function removedToast(runId: string): string {
  return `Removed run ${shortRunId(runId)} from the Inbox`;
}

/**
 * A **Remove from Inbox** that didn't go through (C681 32), by why, never by the host's own text:
 * "Couldn't remove this: the engine isn't answering. It may still be starting."
 */
export function removeFailedLine(failure: ProposalFailure, runId: string): string {
  return `Couldn't remove this: ${removeFailureReasons[failure](shortRunId(runId))}`;
}

const removeFailureReasons: Readonly<Record<ProposalFailure, (run: string) => string>> = {
  "changes-back": (run) => `run ${run}'s changes are there again. Review them instead.`,
  "not-answering": () => "the engine isn't answering. It may still be starting.",
  untrusted: () => "this workspace isn't trusted yet.",
  unexplained: () => "Halonic ran into a problem it can't explain yet.",
};

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
 * What a done proposal came to (Q10), in place of its row's meta: "Accepted 2 of 3 changes",
 * "Rejected", or "Not reviewed" when nothing was accepted and something was left undecided, as
 * when it expired or was removed.
 */
export function doneOutcome(files: readonly ProposalFile[]): string {
  const accepted = files.some((file) => file.decision === "accepted");
  if (!accepted && files.some((file) => file.decision === "undecided")) return notReviewed;
  return decidedSummary(files) || notReviewed;
}

/** A done proposal's file, or the whole proposal, that nobody decided (Q10). */
export const notReviewed = "Not reviewed";

/**
 * Under "Couldn't undo this." when the host put back none of a decision's files: "notes/a.md
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
 * The toast when an **Undo** put back only some of a decision's files (C665 31, microcopy 16's
 * Partly undone): "Undid part of the changes from run 01JD8Q", above {@link undoPartLine}.
 */
export function undidPartToast(runId: string): string {
  return `Undid part of the changes from run ${shortRunId(runId)}`;
}

/**
 * Under {@link undidPartToast}, the files it left, which keep their decision: "Couldn't put back
 * notes/a.md: it changed after it was accepted." Paths come from the workspace.
 */
export function undoPartLine(verb: "accepted" | "rejected", paths: readonly string[]): string {
  const [only] = paths;
  if (paths.length === 1 && only !== undefined) {
    return `Couldn't put back ${markHiddenName(only)}: it changed after it was ${verb}.`;
  }
  return `Couldn't put back ${paths.length} files: they changed after they were ${verb}.`;
}

/**
 * When a later decision on one of its files kept a whole **Undo** back (C665 31): "Couldn't undo
 * this: you decided more of run 01JD8Q's changes after it."
 */
export function undoDecidedAfterToast(runId: string): string {
  return `Couldn't undo this: you decided more of run ${shortRunId(runId)}'s changes after it.`;
}

/**
 * Why an **Undo** pressed while the engine isn't answering sent nothing (C735 row 22): its toast
 * stays, so the line says to press it again rather than what the page shows meanwhile.
 *
 * @param reason the host's sentence alone, such as "The engine isn't answering."
 * @example undoHeldLine("The engine isn't answering."); // "The engine isn't answering. Press Undo again once it answers."
 */
export function undoHeldLine(reason: string): string {
  return `${reason} Press Undo again once it answers.`;
}

/**
 * On a proposal the window can't decide (no Accept or Reject here), the line before the command
 * that shows it, {@link decideCommand}. Only a served Studio or a phone gets it, so it says where
 * to go, "in a terminal on your computer", not a terminal on the device in hand (C671 22), in the
 * words of the line for a window that lists no proposals, {@link proposalsElsewhere} (C682 1).
 */
export const decideElsewhereLine =
  "Studio can't accept or reject these changes here. To see them and decide, use the desktop app, or run this in a terminal on your computer:";

/**
 * The command that shows a run's proposal with its diffs, and ends with how to accept or reject
 * it: "halonic proposals show 01JD8Q". The CLI takes the short id in either case.
 */
export function decideCommand(runId: string): string {
  return `halonic proposals show ${shortRunId(runId)}`;
}

/**
 * Under Needs you in a window that lists no proposals, a served Studio or a phone (HAL-15986):
 * the line around the command, which the page shows in code style. A phone has no desktop app and
 * maybe no terminal, so the line says the terminal is on your computer (C671 23, HAL-16104).
 */
export const proposalsElsewhere = {
  before: "Changes your runs propose show only in the desktop app, or with",
  command: "halonic proposals",
  after: "in a terminal on your computer.",
};
