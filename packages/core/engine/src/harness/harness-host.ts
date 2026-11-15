// What the engine needs from the host to run an agent in a harness. The
// engine declares these small interfaces itself, so it depends on no app
// service and no adapter: the host wires `AgentPlacement`, the sandboxes,
// the harnesses and the bridge server into them.

import type { InstructionTrustService } from "@halonicjs/app";
import type { DeniedPathGroup, RunVersion } from "@halonicjs/events";
import type { Agent } from "@halonicjs/format";
import type {
  BridgeRecorder,
  Harness,
  HarnessBridge,
  OpenHarnessBridge,
  Sandbox,
  SandboxProfile,
} from "@halonicjs/ports";
import type { ProgramHarness } from "../kernel/decide-types.ts";
import type { StartPhase } from "./start-limits.ts";

/** Where an agent's harness runs: in a sandbox, or on this computer outside one. */
export type Placement = "sandbox" | "this-computer";

/**
 * Where an agent's harness runs, as the placement policy answers. On this
 * computer, `chosenAt` is when the person chose that, as ISO text, for the
 * run's `sandbox.off` event.
 */
export type PlacementAnswer =
  | { readonly runsOn: "sandbox" }
  | { readonly runsOn: "this-computer"; readonly chosenAt: string };

/** The agent a harness question is about. */
export interface HarnessAgent {
  /** The run the agent works in; for a chat turn, which has no run, the turn's own id (`chat_…`). */
  readonly runId: string;
  readonly hubId: string;
  readonly agentId: string;
  /**
   * The harness the call runs in: the run's own, as `halonic run --harness`
   * sets it, or the one the agent's file names.
   */
  readonly harness: ProgramHarness;
  /**
   * The agent's file as the call reads it: the run's kept definitions, or
   * for a chat turn the workspace's. The host reads the working folder and
   * the allowed sites from here, never from today's files.
   */
  readonly file: Agent;
  /**
   * The version of the workspace the run read, as its `run.started` names
   * it: what a host that runs from versions reads the agent's file from.
   * `null` for a chat turn, which has no run, and for a run kept before
   * versions were recorded.
   */
  readonly version: RunVersion | null;
  /**
   * Where the agent reads and writes workspace files: its top-level run's
   * proposal folder, a worktree of the workspace in Halonic's data folder;
   * `null` for the workspace itself, as in a chat turn or on a host with no
   * proposal folders.
   */
  readonly filesFolder: string | null;
}

/**
 * Where each agent's harness runs. The host implements it with the read side
 * of `AgentPlacement` in `core/app`; the engine can only ask, never choose,
 * so nothing on a run's path can take an agent out of its sandbox.
 */
export interface PlacementPolicy {
  /** `sandbox` unless a person chose this computer for the agent's file as it is now. */
  where(agent: HarnessAgent): Promise<PlacementAnswer>;
}

/**
 * Opens the Halonic bridge of one harness run. The host fills in what the
 * bridge serves (the providers, prices, tools and approvals); the engine
 * gives it the run, the agent and where its events go, and closes it when
 * the harness call ends.
 */
export interface HarnessBridgeHost {
  /** @throws when the bridge can't listen on loopback */
  open(agent: HarnessAgent, recorder: BridgeRecorder): Promise<OpenHarnessBridge>;
}

/** A sandbox profile for one harness run, with what its `sandbox.opened` event shows. */
export interface HarnessProfile {
  /** Without the harness's own variables: the engine adds them with `addHarnessEnvironment`. */
  readonly profile: SandboxProfile;
  /** The groups the profile's denied paths were built from, for `sandbox.opened`. */
  readonly deniedGroups: readonly DeniedPathGroup[];
}

/**
 * Builds the sandbox profile of a harness run from the agent's file, the
 * trusted workspace and Halonic's data folders. It lives in the host because
 * it resolves the working folder on disk, symlinks included.
 *
 * With a `filesFolder`, the agent's working folder resolves in that folder
 * instead of the workspace (`<filesFolder>/files/agents/writer`), and the
 * profile may write nowhere in the workspace: the run proposes its changes
 * from there (requirement `engine.run-proposal-folder`).
 */
export interface HarnessProfileBuilder {
  /**
   * @param bridge - the run's open bridge, whose loopback address the profile's network allows
   * @throws when the agent's working folder resolves outside the workspace, or the
   *   `filesFolder` when there is one, or into a protected folder
   */
  profileOf(agent: HarnessAgent, bridge: HarnessBridge): Promise<HarnessProfile>;
}

/** The instructions a harness run starts with, pinned by hash: no contents, no absolute paths. */
export interface HarnessInstructionsPin {
  /** `AGENTS.md` and each skill file, by path relative to the run's folder, with its `sha256:` digest. */
  readonly files: readonly { readonly path: string; readonly sha256: string }[];
  /** The digest of the whole set. */
  readonly sha256: string;
}

/**
 * Where the instructions of a harness run come from. The host copies the
 * agent's `AGENTS.md` and selected skills into the run's folder, read-only,
 * and pins them; the engine records the pin and never reads the files.
 */
export interface HarnessInstructionSource {
  /**
   * @returns the pin of what the run starts with, or `null` when the agent has no instruction files
   * @throws when the files can't be copied; the call fails before the harness starts
   */
  pinOf(agent: HarnessAgent): Promise<HarnessInstructionsPin | null>;
}

/**
 * Whether a person trusted the instructions a harness run starts with. The
 * host gives the app's `InstructionTrustService` and the workspace's resolved
 * real path; the engine only asks, so nothing on a run's path can trust
 * instructions.
 */
export interface HarnessInstructionTrust {
  readonly service: Pick<InstructionTrustService, "check">;
  /** The workspace's resolved real path, as in the trusted pins' keys. */
  readonly location: string;
}

/** What the local executor needs to carry out `run-harness` effects. */
export interface HarnessRunsOptions {
  readonly placement: PlacementPolicy;
  /**
   * The sandbox for each placement: the fenced sandbox for `sandbox`, and the
   * launcher's unfenced session for `this-computer`. Both go through the same
   * port, so a run takes the same steps either way.
   */
  readonly sandboxes: Readonly<Record<Placement, Sandbox>>;
  /** The harnesses the host offers, by their `id`. */
  readonly harnesses: Readonly<Partial<Record<ProgramHarness, Harness>>>;
  readonly bridges: HarnessBridgeHost;
  readonly profiles: HarnessProfileBuilder;
  /** Where the run's instruction files come from; without it, no `harness.instructions` is written. */
  readonly instructions?: HarnessInstructionSource;
  /**
   * Whether the instructions the run starts with are trusted. A run whose
   * instructions aren't, or whose check doesn't answer in time, doesn't
   * start (requirement `engine.harness-instructions-trust`). Without it,
   * nothing is checked.
   */
  readonly instructionTrust?: HarnessInstructionTrust;
  /** The person's home folder, so `sandbox.opened` and `sandbox.blocked` show paths in it with `~`; `null` when unknown. */
  readonly home: string | null;
  /**
   * How long each start may take, in milliseconds: the sandbox's opening,
   * the instruction trust check's answer and the harness's first event.
   * Defaults: 30 s, 10 s and 60 s.
   */
  readonly startTimeoutsMs?: Readonly<Partial<Record<StartPhase, number>>>;
  /**
   * Whether the workspace is local only (`privacy.localOnly: true`): then
   * every call is refused before anything starts, because a harness program
   * sends the work to its own cloud model. The local executor sets it from
   * its own `localOnly`.
   */
  readonly localOnly?: boolean;
}
