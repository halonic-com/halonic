// Which proposal a run id the person typed names: the full id or the short
// one `halonic proposals` lists, in any case, as `halonic runs show` takes
// a run id.

import { type ProposedRecord, type RunProposals, shortRunId } from "@halonicjs/app";
import { OwnLineError } from "../../command.ts";
import { proposalsMessages } from "../../messages/proposals.ts";
import { printable } from "../../output/printable.ts";

/** Where the person typed the id: the workspace's name and their own `--dir`. */
export interface ProposalPlace {
  /** The workspace's name, made printable. */
  readonly workspaceName: string;
  /** The `--dir` the person gave, for the commands a fix suggests. */
  readonly dir: string | undefined;
}

/**
 * The open proposal of the run `typed` names. A proposal that is done
 * isn't found: nothing is left to show or decide in it.
 *
 * @throws OwnLineError `not_found` when no open proposal has that id
 * @throws OwnLineError `invalid_input` when two end in that short id
 */
export async function findProposal(
  proposals: RunProposals,
  typed: string,
  place: ProposalPlace,
): Promise<ProposedRecord> {
  const wanted = typed.toLowerCase();
  const open = await proposals.list();
  const exact = open.find((record) => record.proposal.runId.toLowerCase() === wanted);
  if (exact !== undefined) return exact;
  const byShortId = open.filter(
    (record) => shortRunId(record.proposal.runId).toLowerCase() === wanted,
  );
  const [one, ...more] = byShortId;
  if (one !== undefined && more.length === 0) return one;
  if (one !== undefined) {
    throw new OwnLineError(
      "invalid_input",
      proposalsMessages.severalProposals(shortRunId(one.proposal.runId), place.workspaceName),
      proposalsMessages.severalProposalsFix(place.dir),
    );
  }
  throw new OwnLineError(
    "not_found",
    proposalsMessages.noProposal(printable(typed), place.workspaceName),
    proposalsMessages.noProposalFix(place.dir),
  );
}
