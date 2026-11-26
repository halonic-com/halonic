import type { AgentHostTransport, ProposalAccepted } from "@halonicjs/adapter-agent-host-client";
import { AgentHostError, AgentHostRunProposals } from "@halonicjs/adapter-agent-host-client";
import type { ProposalTarget, ProposedRecord } from "@halonicjs/app";
import {
  type ProposalCompareChoice,
  type ProposalDecided,
  type ProposalDecisions,
  ProposalFailedError,
  type ProposalFailure,
  ProposalGoneError,
  type ProposalUndone,
} from "@halonicjs/studio-feature-inbox/api";
import { AgentHostNotAnswering } from "@halonicjs/studio-services";
import { EngineNotAnswering } from "@halonicjs/studio-shell";

/**
 * The workspace's open run proposals from the agent host, for
 * `WorkspaceRuns`' `proposals` (`studio.workspace-run-proposals`). A folder that isn't
 * trusted yet asks the host nothing, so opening one starts no host call. A host that
 * doesn't serve proposals here, because it has no profile folder (`not_found`)
 * or wasn't told to serve the workspace (`unknown_workspace`), keeps none for
 * it, so that lists none. Neither does a sandbox that isn't set up, whose host the shell can't
 * start (`wsl-missing`, `distro-missing`): Settings › Agent sandbox offers its setup (HAL-19066).
 * Any other failure is thrown, and the Inbox shows it.
 */
export function hostProposalsOf(
  transport: AgentHostTransport,
  location: string,
  trusted: () => boolean,
): () => Promise<readonly ProposedRecord[]> {
  return hostRecordsOf(transport, location, trusted, (proposals) => proposals.list());
}

/**
 * The workspace's run proposals settled in the last 30 days, for `WorkspaceRuns`'
 * `doneProposals` and the Inbox's Done heading (`studio.workspace-done-proposals`), read the way
 * {@link hostProposalsOf} reads the open ones.
 */
export function hostDoneProposalsOf(
  transport: AgentHostTransport,
  location: string,
  trusted: () => boolean,
): () => Promise<readonly ProposedRecord[]> {
  return hostRecordsOf(transport, location, trusted, (proposals) => proposals.done());
}

function hostRecordsOf(
  transport: AgentHostTransport,
  location: string,
  trusted: () => boolean,
  read: (proposals: AgentHostRunProposals) => Promise<readonly ProposedRecord[]>,
): () => Promise<readonly ProposedRecord[]> {
  const proposals = new AgentHostRunProposals(transport, location);
  return async () => {
    if (!trusted()) return [];
    try {
      return await read(proposals);
    } catch (error) {
      if (error instanceof AgentHostError && servesNone.has(error.kind)) return [];
      if (error instanceof AgentHostNotAnswering && noSandbox.has(error.reason ?? "")) return [];
      throw error;
    }
  };
}

const servesNone = new Set(["not_found", "unknown_workspace"]);

/**
 * The shell's reasons for a host it couldn't start because the sandbox has no distro yet, so it
 * keeps no proposals. A distro without its runtime (`runtime-missing`) may keep some, so that
 * failure still shows.
 */
const noSandbox = new Set(["wsl-missing", "distro-missing"]);

/**
 * Accept, Reject, Compare, Undo and settle on the workspace's run proposals through the agent
 * host, for the Inbox's proposal page (`studio.workspace-proposal-decisions`,
 * `studio.workspace-proposal-compare`). The host writes the files and
 * keeps each undo step; Studio holds only its id. A proposal whose texts are gone (the host's
 * `proposal_unavailable`) fails with {@link ProposalGoneError}, and Remove takes it out
 * (`studio.workspace-proposal-remove`). Any other failure is a {@link ProposalFailedError} sorted
 * by the host's kind, never its text (C665 27). A folder that isn't trusted yet lists no proposals,
 * so nothing reaches these; should something, it is refused as `untrusted` without asking the host.
 */
export function hostProposalDecisionsOf(
  transport: AgentHostTransport,
  location: string,
  trusted: () => boolean,
): ProposalDecisions {
  const proposals = new AgentHostRunProposals(transport, location);
  const whenTrusted = <T>(call: () => Promise<T>): Promise<T> =>
    trusted()
      ? call().catch(decisionFailed)
      : Promise.reject(new ProposalFailedError("untrusted", untrusted));
  return {
    accept: (runId: string, target: ProposalTarget) =>
      whenTrusted(async () => decidedOf(await proposals.accept(runId, target))),
    compare: (runId: string, path: string) =>
      whenTrusted(async () => {
        const { saved, run, combined, seen } = await proposals.compare(runId, path);
        return { saved, run, canCombine: combined !== null, seen };
      }),
    choose: (runId: string, path: string, choice: ProposalCompareChoice, seen: string) =>
      whenTrusted(async () => decidedOf(await proposals.choose(runId, path, choice, seen))),
    reject: (runId: string, target: ProposalTarget) =>
      whenTrusted(async (): Promise<ProposalDecided> => {
        const { undo } = await proposals.reject(runId, target);
        return { undo, changedSinceRun: [], cantBeWritten: [] };
      }),
    undo: (undo: string) =>
      whenTrusted(async (): Promise<ProposalUndone> => {
        const { changedOnDisk, refused, decidedAfter } = await proposals.restore(undo, "before");
        return { leftAlone: [...changedOnDisk, ...refused.map((r) => r.path)], decidedAfter };
      }),
    settle: (runId: string) => whenTrusted(async () => void (await proposals.settle(runId))),
    remove: (runId: string) => whenTrusted(() => proposals.remove(runId).catch(removeFailed)),
  };
}

/** What an Accept or a choice in Compare did, as the Inbox knows it. */
function decidedOf({ undo, changedOnDisk, refused }: ProposalAccepted): ProposalDecided {
  return { undo, changedSinceRun: changedOnDisk, cantBeWritten: refused.map((r) => r.path) };
}

/**
 * A call that failed, as the Inbox knows it: the host's `proposal_unavailable` as
 * {@link ProposalGoneError}, one already sorted as it is, and any other sorted by
 * {@link failureOf}.
 */
function decisionFailed(error: unknown): never {
  if (error instanceof ProposalFailedError) throw error;
  if (error instanceof AgentHostError && error.kind === "proposal_unavailable") {
    throw new ProposalGoneError(error.message);
  }
  throw new ProposalFailedError(failureOf(error), detailsOf(error));
}

/**
 * A Remove that failed (C681 32): the host refuses (`proposal_refused`) a proposal whose changes
 * can be opened again; anything else as for a decision.
 */
function removeFailed(error: unknown): never {
  const refused = error instanceof AgentHostError && error.kind === "proposal_refused";
  throw new ProposalFailedError(refused ? "changes-back" : failureOf(error), detailsOf(error));
}

/**
 * Why a call failed, by the error's type, never its text: the transport's `AgentHostNotAnswering`
 * is a host that isn't running; every other kind is one Halonic can't explain yet.
 */
function failureOf(error: unknown): ProposalFailure {
  return error instanceof EngineNotAnswering ? "not-answering" : "unexplained";
}

function detailsOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const untrusted = "This workspace isn't trusted yet, so Halonic can't change its files.";
