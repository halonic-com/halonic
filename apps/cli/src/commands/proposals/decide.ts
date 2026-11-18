// `halonic proposals accept|discard <run-id> [<file>]`: decides a run's
// proposal, all of it or one file. A thin command over `RunProposals`:
// Accept writes each file only while it is still the run's base, Discard
// leaves the files alone. The CLI has no Undo toast, so a proposal with
// nothing left to decide is settled straight away.

import {
  type AcceptResult,
  type ProposalTarget,
  type ProposedRecord,
  type RunProposals,
  shortRunId,
} from "@halonicjs/app";
import {
  type CommandContext,
  type CommandInput,
  type CommandResult,
  OwnLineError,
  UsageError,
} from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { type Phrase, plainText } from "../../messages/phrase.ts";
import { proposalsMessages } from "../../messages/proposals.ts";
import { printable } from "../../output/printable.ts";
import { findProposal, type ProposalPlace } from "./find-proposal.ts";
import { undecidedFiles } from "./list.ts";
import { type ProposalsSetup, unlessUnavailable, withProposals } from "./open-proposals.ts";

/** What the person typed: the run, and the one file when they named one. */
interface Decided {
  readonly typed: string;
  readonly file: string | undefined;
}

/** The proposal being decided, with what the command shows it as. */
interface Deciding {
  readonly proposals: RunProposals;
  readonly record: ProposedRecord;
  readonly target: ProposalTarget;
  readonly shownId: string;
  readonly place: ProposalPlace;
}

/**
 * Accepts the proposal, or one file of it: writes each undecided file the
 * saved file still matches the run's base for. A file changed since stays
 * undecided and is named, and the command exits with `conflict` (5); a file
 * Halonic may never write is named too.
 *
 * @throws UsageError when there isn't one run id, and at most one file
 * @throws OwnLineError when no open proposal has that id, two end in it, it
 *   proposes no change to the file, or its texts are gone
 * @throws NoWorkspaceError when the folder holds no workspace
 */
export function acceptProposal(
  input: CommandInput,
  context: CommandContext,
  setup: ProposalsSetup,
): Promise<CommandResult> {
  return decide(input, context, setup, async (deciding) => {
    const { proposals, record, target, shownId, place } = deciding;
    const result = await unlessUnavailable(
      () => proposals.accept(record.proposal.runId, target),
      shownId,
      place,
    );
    return { lines: acceptLines(result), conflict: result.changedOnDisk.length > 0, json: result };
  });
}

/**
 * Discards the proposal, or one file of it: the saved files stay as they
 * are. A proposal whose texts were deleted outside Halonic is removed.
 *
 * @throws as for {@link acceptProposal}, except for gone texts
 */
export function discardProposal(
  input: CommandInput,
  context: CommandContext,
  setup: ProposalsSetup,
): Promise<CommandResult> {
  return decide(input, context, setup, async ({ proposals, record, target, shownId }) => {
    const { runId } = record.proposal;
    if (await proposals.isUnavailable(runId)) {
      await proposals.removeUnavailable(runId);
      const lines = [proposalsMessages.removedUnavailable(shownId).phrase];
      return { lines, conflict: false, json: { removed: true } };
    }
    const covered = undecidedFiles(record).filter(
      (path) => target === "all" || path === target.file,
    );
    await proposals.reject(runId, target);
    const lines = [proposalsMessages.discarded(covered.length).phrase];
    return { lines, conflict: false, json: { discarded: covered } };
  });
}

/** What one decision did, before the proposal is settled. */
interface DecisionOutcome {
  readonly lines: readonly Phrase[];
  /** Whether a file was left undecided because it changed since the run. */
  readonly conflict: boolean;
  readonly json: object;
}

/** Finds the proposal and the target, runs `decision`, then settles the proposal if it can. */
function decide(
  input: CommandInput,
  context: CommandContext,
  setup: ProposalsSetup,
  decision: (deciding: Deciding) => Promise<DecisionOutcome>,
): Promise<CommandResult> {
  const { typed, file } = runIdAndFile(input);
  return withProposals(input, context, setup, async ({ proposals, place }) => {
    const record = await findProposal(proposals, typed, place);
    const shownId = shortRunId(record.proposal.runId);
    const target = targetOf(record, file, shownId, place);
    const outcome = await decision({ proposals, record, target, shownId, place });
    const settled = (await proposals.settle(record.proposal.runId)) === "settled";
    const after = await proposals.get(record.proposal.runId);
    const left = after === null ? 0 : undecidedFiles(after).length;
    const ending = settled
      ? proposalsMessages.done(shownId)
      : proposalsMessages.stillLeft(left, shownId, place.dir);
    const lines = [...outcome.lines, ending.phrase];
    const json = { ...outcome.json, settled };
    if (!outcome.conflict) return { exitCode: exitCode.ok, lines, json };
    const message = plainText(proposalsMessages.changedOnDiskFailure().phrase);
    return { exitCode: exitCode.conflict, lines, json, failure: { kind: "conflict", message } };
  });
}

/** What Accept wrote, and the files it left: changed since the run, or never writable. */
function acceptLines(result: AcceptResult): Phrase[] {
  const shown = (paths: readonly string[]) => paths.map(printable);
  const lines = [
    result.written.length === 0
      ? proposalsMessages.wroteNothing().phrase
      : proposalsMessages.wrote(shown(result.written)).phrase,
  ];
  if (result.changedOnDisk.length > 0) {
    lines.push(proposalsMessages.changedOnDisk(shown(result.changedOnDisk)).phrase);
  }
  if (result.refused.length > 0) {
    const refused = result.refused.map((each) => each.path);
    lines.push(proposalsMessages.cantWrite(shown(refused)).phrase);
  }
  return lines;
}

/**
 * The whole proposal, or the one file named.
 *
 * @throws OwnLineError `not_found` when the proposal doesn't change that file
 */
function targetOf(
  record: ProposedRecord,
  file: string | undefined,
  shownId: string,
  place: ProposalPlace,
): ProposalTarget {
  if (file === undefined) return "all";
  // A path as `show` prints it, with "/"; one typed with "\" on Windows names the same file.
  const path = file.replaceAll("\\", "/");
  if (record.proposal.files.some((each) => each.path === path)) return { file: path };
  throw new OwnLineError(
    "not_found",
    proposalsMessages.noFile(printable(file), shownId),
    proposalsMessages.noFileFix(shownId, place.dir),
  );
}

/** The run id, and at most one file; else the usage error with the usage line. */
function runIdAndFile(input: CommandInput): Decided {
  const [typed, file, ...more] = input.positionals;
  if (typed === undefined || more.length > 0) {
    throw new UsageError(proposalsMessages.takesRunIdAndFile());
  }
  return { typed, file };
}
