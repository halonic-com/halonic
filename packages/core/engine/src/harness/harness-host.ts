// What the engine needs from the host to run an agent in a harness. The
// engine declares these small interfaces itself, so it depends on no app
// service and no adapter: the host wires `AgentPlacement`, the sandboxes,
// the harnesses and the bridge server into them.

import type { DeniedPathGroup } from "@halonicjs/events";
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
  /** The person's home folder, so `sandbox.opened` and `sandbox.blocked` show paths in it with `~`; `null` when unknown. */
  readonly home: string | null;
  /**
   * How long each start may take, in milliseconds: the sandbox's opening and
   * the harness's first event. Defaults: 30 s and 60 s.
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
