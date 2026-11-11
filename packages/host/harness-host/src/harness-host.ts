// Builds what the engine needs to run agents in harnesses, from ports only
// (requirement `harness-host.builder`): its `HarnessRunsOptions` and the
// proposal folders of its top-level runs. The Node parts (the sandboxes,
// the bridge server, git, the files on disk) stay with the caller, so the
// CLI and the Studio's host build the same thing from their own parts.

import {
  AgentPlacement,
  ProposalFolders,
  type ProposalVcs,
  type RunCopies,
  RunProposals,
  type Trash,
} from "@halonicjs/app";
import type {
  HarnessProfileBuilder,
  HarnessRunsOptions,
  RunProposalFolders,
} from "@halonicjs/engine";
import type {
  AgentPlacementStore,
  Clock,
  DefinitionStore,
  Digest,
  HarnessBridgeServer,
} from "@halonicjs/ports";
import { type BridgeServicesSource, LocalBridgeHost } from "./bridge-host.ts";
import { HistoryProposalFolders } from "./history-proposal-folders.ts";
import { type AgentFiles, FilePlacementPolicy } from "./placement-policy.ts";

/** What {@link harnessHostOf} builds from. */
export interface HarnessHostInput {
  /** The fenced sandbox for `sandbox`, and the launcher's unfenced session for `this-computer`. */
  readonly sandboxes: HarnessRunsOptions["sandboxes"];
  /** The harnesses the host offers, by their `id`. */
  readonly harnesses: HarnessRunsOptions["harnesses"];
  /** Opens each run's bridge on loopback. */
  readonly bridgeServer: HarnessBridgeServer;
  /** What each agent's bridge serves: its providers, prices, tools and approvals. */
  readonly services: BridgeServicesSource;
  readonly profiles: HarnessProfileBuilder;
  /** The person's home folder, for `~` in sandbox events; `null` when unknown. */
  readonly home: string | null;
  readonly startTimeoutsMs?: HarnessRunsOptions["startTimeoutsMs"];
  /** Where each agent runs, as a person chose. */
  readonly placement: {
    /** The choices in the person's profile. */
    readonly store: AgentPlacementStore;
    /** The workspace's real path, which the choices are keyed by. */
    readonly location: string;
    readonly files: AgentFiles;
  };
  /** Hashes agent files and proposal bases. */
  readonly digest: Digest;
  readonly clock: Clock;
  /** What the proposal service needs besides the digest and the clock. */
  readonly proposals: {
    /** The workspace's version control, or `null` when history is off. */
    readonly vcs: ProposalVcs | null;
    /** Where runs with history off get their copy, or `null`: such a run then can't start. */
    readonly copies: RunCopies | null;
    /** The proposal records' own store, in the profile, never the workspace's. */
    readonly records: DefinitionStore;
    /** The workspace's files, which Accept writes. */
    readonly store: DefinitionStore;
    /** Where Accept moves a file the run deleted: `refusingTrash` on a host without Accept. */
    readonly trash: Trash;
    /** Receives the error of a folder's end that couldn't finish; the next `start` clears it. */
    readonly onEndFailed: (runId: string, error: unknown) => void;
  };
}

/** What the engine gets: pass `harnesses` and `proposalFolders` to `localEngine`. */
export interface HarnessHost {
  readonly harnesses: HarnessRunsOptions;
  readonly proposalFolders: RunProposalFolders;
  /**
   * Ends the folders of runs that ended while the host was down, and
   * clears what is left of ends that couldn't finish. Call it once, when the
   * engine opens, before it starts any run.
   *
   * @param openRuns - the runs the engine hasn't ended, whose folders stay
   */
  start(openRuns: ReadonlySet<string>): Promise<void>;
}

/**
 * The engine's harness runs and proposal folders, built from the host's ports.
 *
 * @example
 * const host = harnessHostOf({ sandboxes, harnesses, bridgeServer, services, ... });
 * const engine = localEngine({ ...options, harnesses: host.harnesses, proposalFolders: host.proposalFolders });
 * await host.start(openRuns);
 */
export function harnessHostOf(input: HarnessHostInput): HarnessHost {
  const placement = new FilePlacementPolicy({
    reader: new AgentPlacement({
      store: input.placement.store,
      digest: input.digest,
      clock: input.clock,
    }),
    files: input.placement.files,
    location: input.placement.location,
  });
  const harnesses: HarnessRunsOptions = {
    placement,
    sandboxes: input.sandboxes,
    harnesses: input.harnesses,
    bridges: new LocalBridgeHost({ server: input.bridgeServer, services: input.services }),
    profiles: input.profiles,
    home: input.home,
    ...(input.startTimeoutsMs === undefined ? {} : { startTimeoutsMs: input.startTimeoutsMs }),
  };

  const { copies, ...proposalParts } = input.proposals;
  const proposals = new RunProposals({
    ...proposalParts,
    ...(copies === null ? {} : { copies }),
    digest: input.digest,
    clock: input.clock,
  });
  const folders = new ProposalFolders({ proposals });
  return {
    harnesses,
    proposalFolders: new HistoryProposalFolders({ folders, hasCopies: copies !== null }),
    start: (openRuns) => folders.start(openRuns),
  };
}
