import { type RunDetail, type RunProposal, shortRunId } from "@halonicjs/app";
import { openLocalProposals } from "../../local-proposals.ts";
import type { Phrase } from "../../messages/phrase.ts";
import { proposalsMessages } from "../../messages/proposals.ts";
import type { OpenWorkspaceDir } from "../../workspace-dir.ts";
import type { RunSetup } from "./run.ts";

/**
 * The line that says the run left a proposal and how to see it, after a
 * run that ended with changes (HAL-6477): nothing in the person's files
 * changed, so they decide with `halonic proposals`. Read once the engine
 * has closed, since the run's folder ends just after its last event.
 */
export async function waitingProposal(
  dir: OpenWorkspaceDir,
  run: RunDetail,
  setup: RunSetup,
  typedDir: string | undefined,
): Promise<{ readonly lines: Phrase[]; readonly json: RunProposal } | undefined> {
  const { status, id } = run.summary;
  if (status !== "completed" && status !== "failed") return undefined;
  const { proposals, close } = await openLocalProposals(dir.root, {
    ...(setup.profile === undefined ? {} : { profile: setup.profile }),
    ...(setup.engine?.git === undefined ? {} : { git: setup.engine.git }),
  });
  try {
    const record = await proposals.get(id);
    if (record === null || record.settled !== undefined) return undefined;
    const files = record.proposal.files.length;
    const line = proposalsMessages.waiting(shortRunId(id), files, typedDir).phrase;
    return { lines: [[], line], json: record.proposal };
  } finally {
    await close();
  }
}
