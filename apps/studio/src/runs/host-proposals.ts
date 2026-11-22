import type { AgentHostTransport } from "@halonicjs/adapter-agent-host-client";
import { AgentHostError, AgentHostRunProposals } from "@halonicjs/adapter-agent-host-client";
import type { ProposalTarget, ProposedRecord } from "@halonicjs/app";
import type { ProposalDecided, ProposalDecisions } from "@halonicjs/studio-feature-inbox/api";

/**
 * The workspace's open run proposals from the agent host, for
 * `WorkspaceRuns`' `proposals` (`studio.workspace-run-proposals`). A folder that isn't
 * trusted yet asks the host nothing, so opening one starts no host call. A host that
 * doesn't serve proposals here, because it has no profile folder (`not_found`)
 * or wasn't told to serve the workspace (`unknown_workspace`), keeps none for
 * it, so that lists none; any other failure is thrown, and the Inbox shows it.
 */
export function hostProposalsOf(
  transport: AgentHostTransport,
  location: string,
  trusted: () => boolean,
): () => Promise<readonly ProposedRecord[]> {
  const proposals = new AgentHostRunProposals(transport, location);
  return async () => {
    if (!trusted()) return [];
    try {
      return await proposals.list();
    } catch (error) {
      if (error instanceof AgentHostError && servesNone.has(error.kind)) return [];
      throw error;
    }
  };
}

const servesNone = new Set(["not_found", "unknown_workspace"]);

/**
 * Accept, Reject, Undo and settle on the workspace's run proposals through the agent host, for
 * the Inbox's proposal page (`studio.workspace-proposal-decisions`). The host writes the files and
 * keeps each undo step; Studio holds only its id. A folder that isn't trusted yet lists no
 * proposals, so nothing reaches these; should something, it is refused without asking the host.
 */
export function hostProposalDecisionsOf(
  transport: AgentHostTransport,
  location: string,
  trusted: () => boolean,
): ProposalDecisions {
  const proposals = new AgentHostRunProposals(transport, location);
  const whenTrusted = <T>(call: () => Promise<T>): Promise<T> =>
    trusted() ? call() : Promise.reject(new Error(untrusted));
  return {
    accept: (runId: string, target: ProposalTarget) =>
      whenTrusted(async (): Promise<ProposalDecided> => {
        const { undo, changedOnDisk, refused } = await proposals.accept(runId, target);
        return { undo, changedSinceRun: changedOnDisk, cantBeWritten: refused.map((r) => r.path) };
      }),
    reject: (runId: string, target: ProposalTarget) =>
      whenTrusted(async (): Promise<ProposalDecided> => {
        const { undo } = await proposals.reject(runId, target);
        return { undo, changedSinceRun: [], cantBeWritten: [] };
      }),
    undo: (undo: string) => whenTrusted(async () => void (await proposals.restore(undo, "before"))),
    settle: (runId: string) => whenTrusted(async () => void (await proposals.settle(runId))),
  };
}

const untrusted = "This workspace isn't trusted yet, so Studio can't change its files.";
