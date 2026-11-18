// `halonic proposals`: the runs whose changes wait for the person, newest
// first. A thin command over `RunProposals.list`.

import { type ProposedRecord, shortRunId } from "@halonicjs/app";
import type { CommandContext, CommandInput, CommandResult } from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { columns } from "../../messages/columns.ts";
import { dimmed, type Phrase, phrase } from "../../messages/phrase.ts";
import { proposalsMessages } from "../../messages/proposals.ts";
import { endedInWords } from "../../messages/runs-list.ts";
import { endedAt, type RunClock } from "../../run-times.ts";
import { type ProposalsSetup, withProposals } from "./open-proposals.ts";

/**
 * Lists the open proposals, one row each: the run's short id, its files and
 * how many are left to decide, and when the run finished. An empty list says
 * so, and exits 0. With `--json`, the proposals as recorded, with full ids.
 *
 * @throws NoWorkspaceError when the folder holds no workspace
 */
export function listProposals(
  input: CommandInput,
  context: CommandContext,
  setup: ProposalsSetup,
): Promise<CommandResult> {
  return withProposals(input, context, setup, async ({ proposals, place }) => {
    const open = await proposals.list();
    const json = { proposals: open };
    if (open.length === 0) {
      const lines = [proposalsMessages.noProposals(place.workspaceName).phrase];
      return { exitCode: exitCode.ok, lines, json };
    }
    const clock = setup.clock();
    const rows = open.map((record) => proposalRow(record, clock));
    const lines = [...columns(rows), [], proposalsMessages.seeOne(place.dir).phrase];
    return { exitCode: exitCode.ok, lines, json };
  });
}

/** "a1b2c3   2 files, 1 left   5 minutes ago", the time dimmed. */
function proposalRow(record: ProposedRecord, clock: RunClock): Phrase[] {
  const files = record.proposal.files.length;
  const left = undecidedFiles(record).length;
  const ended = endedInWords(endedAt(new Date(record.finishedAt), clock));
  return [
    phrase`${shortRunId(record.proposal.runId)}`,
    proposalsMessages.filesLeft(files, left).phrase,
    dimmed(phrase`${ended}`),
  ];
}

/** The paths of the proposal's files nobody has decided yet. */
export function undecidedFiles(record: ProposedRecord): string[] {
  return record.proposal.files
    .map((file) => file.path)
    .filter((path) => record.decisions[path] === "undecided");
}
