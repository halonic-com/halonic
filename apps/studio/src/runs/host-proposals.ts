import type { AgentHostTransport } from "@halonicjs/adapter-agent-host-client";
import { AgentHostError, AgentHostRunProposals } from "@halonicjs/adapter-agent-host-client";
import type { ProposalTarget, ProposedRecord } from "@halonicjs/app";
import {
  type ProposalDecided,
  type ProposalDecisions,
  ProposalFailedError,
  type ProposalFailure,
  ProposalGoneError,
  type ProposalUndone,
} from "@halonicjs/studio-feature-inbox/api";
import { EngineNotAnswering } from "@halonicjs/studio-shell";

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
 * keeps each undo step; Studio holds only its id. A proposal whose texts are gone (the host's
 * `proposal_unavailable`) fails with {@link ProposalGoneError}, and Remove takes it out
 * (`studio.workspace-proposal-remove`); a Remove that fails says why by the host's kind. A folder that isn't trusted yet lists no proposals, so
 * nothing reaches these; should something, it is refused without asking the host.
 */
export function hostProposalDecisionsOf(
  transport: AgentHostTransport,
  location: string,
  trusted: () => boolean,
): ProposalDecisions {
  const proposals = new AgentHostRunProposals(transport, location);
  const whenTrusted = <T>(call: () => Promise<T>): Promise<T> =>
    trusted() ? call().catch(goneWhenUnavailable) : Promise.reject(new Error(untrusted));
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
    undo: (undo: string) =>
      whenTrusted(async (): Promise<ProposalUndone> => {
        const { changedOnDisk, refused } = await proposals.restore(undo, "before");
        return { leftAlone: [...changedOnDisk, ...refused.map((r) => r.path)] };
      }),
    settle: (runId: string) => whenTrusted(async () => void (await proposals.settle(runId))),
    remove: (runId: string) => whenTrusted(() => proposals.remove(runId).catch(removeFailed)),
  };
}

/** The host's `proposal_unavailable` as the Inbox knows it; any other failure as it is. */
function goneWhenUnavailable(error: unknown): never {
  if (error instanceof AgentHostError && error.kind === "proposal_unavailable") {
    throw new ProposalGoneError(error.message);
  }
  throw error;
}

/**
 * A Remove that failed, sorted for the Inbox's words by the error's type and the host's kind, never
 * its text (C681 32): the host refuses (`proposal_refused`) a proposal whose changes can be opened
 * again, and the transport's `AgentHostNotAnswering` is a host that isn't running.
 */
function removeFailed(error: unknown): never {
  const details = error instanceof Error ? error.message : String(error);
  throw new ProposalFailedError(removeFailureOf(error), details);
}

function removeFailureOf(error: unknown): ProposalFailure {
  if (error instanceof EngineNotAnswering) return "not-answering";
  if (error instanceof AgentHostError && error.kind === "proposal_refused") return "changes-back";
  return "unexplained";
}

const untrusted = "This workspace isn't trusted yet, so Studio can't change its files.";
