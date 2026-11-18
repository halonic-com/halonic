// `halonic proposals show <run-id>`: what one run proposes, file by file,
// each undecided file as a diff from the saved file to the run's text. A
// thin command over `RunProposals.compare`, the texts the Studio's Compare
// shows. It changes nothing.

import {
  type Decision,
  type ProposedFile,
  type ProposedRecord,
  type RunProposals,
  shortRunId,
} from "@halonicjs/app";
import type { CommandContext, CommandInput, CommandResult } from "../../command.ts";
import { UsageError } from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { type Phrase, phrase } from "../../messages/phrase.ts";
import { proposalsMessages, type ShownDecision } from "../../messages/proposals.ts";
import { printable } from "../../output/printable.ts";
import { unifiedDiff } from "./diff-lines.ts";
import { findProposal } from "./find-proposal.ts";
import { type ProposalsSetup, unlessUnavailable, withProposals } from "./open-proposals.ts";

/** One file as `show` prints it, and as its `--json` gives it. */
interface ShownFile {
  readonly path: string;
  readonly change: ProposedFile["change"];
  readonly decision: Decision;
  /** Whether the saved file changed since the run started; Accept won't write it. */
  readonly changedSince: boolean;
  /** The unified diff from the saved file to the run's text; empty for a decided file. */
  readonly diff: readonly string[];
}

/**
 * Shows the open proposal of one run: a heading, then each file with how
 * the run changed it and, while it is undecided, its diff. With `--json`,
 * the proposal as recorded and each file's diff lines.
 *
 * @throws UsageError when there isn't exactly one run id
 * @throws OwnLineError when no open proposal has that id, two end in it, or its texts are gone
 * @throws NoWorkspaceError when the folder holds no workspace
 */
export function showProposal(
  input: CommandInput,
  context: CommandContext,
  setup: ProposalsSetup,
): Promise<CommandResult> {
  const typed = oneRunId(input);
  return withProposals(input, context, setup, async ({ proposals, place }) => {
    const record = await findProposal(proposals, typed, place);
    const shownId = shortRunId(record.proposal.runId);
    const files = await unlessUnavailable(
      () => Promise.all(record.proposal.files.map((file) => shownFile(proposals, record, file))),
      shownId,
    );
    const lines: Phrase[] = [
      proposalsMessages.heading(shownId, files.length, place.workspaceName).phrase,
      ...files.flatMap(fileLines),
    ];
    return { exitCode: exitCode.ok, lines, json: { proposal: record, files } };
  });
}

async function shownFile(
  proposals: RunProposals,
  record: ProposedRecord,
  file: ProposedFile,
): Promise<ShownFile> {
  const decision = record.decisions[file.path] ?? "undecided";
  const shown = { path: file.path, change: file.change, decision };
  if (decision !== "undecided") return { ...shown, changedSince: false, diff: [] };
  const texts = await proposals.compare(record.proposal.runId, file.path);
  return {
    ...shown,
    changedSince: texts.saved !== texts.base,
    diff: unifiedDiff(texts.saved, texts.run),
  };
}

/** A blank line, the file's heading, then its diff, or why there is none. */
function fileLines(file: ShownFile): Phrase[] {
  const heading = proposalsMessages.fileHeading(
    file.change,
    printable(file.path),
    shownDecision(file.decision),
  ).phrase;
  if (file.decision !== "undecided") return [[], heading];
  const diff: Phrase[] =
    file.diff.length === 0
      ? [proposalsMessages.noDifference().phrase]
      : file.diff.map((line) => phrase`  ${printable(line)}`);
  const since = file.changedSince ? [proposalsMessages.changedSince().phrase] : [];
  return [[], heading, ...since, ...diff];
}

function shownDecision(decision: Decision): ShownDecision {
  switch (decision) {
    case "undecided":
      return "undecided";
    case "accepted":
      return "accepted";
    case "rejected":
      return "discarded";
    case "not-applicable":
      return "cantWrite";
  }
}

/** The one argument, the run id as typed; else the usage error with the usage line. */
function oneRunId(input: CommandInput): string {
  const [runId, ...more] = input.positionals;
  if (runId === undefined || more.length > 0) {
    throw new UsageError(proposalsMessages.takesOneRunId());
  }
  return runId;
}
