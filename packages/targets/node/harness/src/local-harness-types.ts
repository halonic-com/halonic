// The types of the local harness host's input and result (HAL-17020): split
// out of `local-harness-host.ts` so that file holds only the wiring.

import type { GitRunnerOptions } from "@halonicjs/adapter-git";
import type { HarnessRunsOptions } from "@halonicjs/engine";
import type { RunVersion } from "@halonicjs/events";
import type { BridgeAgent, HarnessHost, ProviderAccessChoice } from "@halonicjs/host-harness-host";
import type {
  Clock,
  DefinitionStore,
  Digest,
  HarnessBridgeServer,
  HttpClient,
  KeyOrigins,
  Secrets,
} from "@halonicjs/ports";
import type { ProfileEnvironment, ProfileFolder, WorkspaceFolders } from "@halonicjs/profile";
import type { LoadedWorkspace } from "@halonicjs/workspace";

/**
 * The Node parts a test replaces. Each one left out is this computer's: the
 * srt sandbox, the launcher, Claude Code and Codex, and a bridge on Node's
 * own `http`.
 */
export interface LocalHarnessParts {
  /** The fenced sandbox, for agents that run in `sandbox`. */
  readonly fenced?: HarnessRunsOptions["sandboxes"]["sandbox"];
  /** The launcher's unfenced session, for agents the person set to "On this computer". */
  readonly launcher?: HarnessRunsOptions["sandboxes"]["this-computer"];
  /** The harnesses, by their `id`. */
  readonly harnesses?: HarnessRunsOptions["harnesses"];
  /** Opens every run's bridge, whatever its placement; Node's, on the keys of `cliProviderKeys`, by default. */
  readonly bridgeServer?: HarnessBridgeServer;
  /**
   * What the Node bridges call a provider at its own `baseUrl` with; by
   * default a client that checks the address as a connector's and never
   * reaches one of Halonic's own ports.
   */
  readonly compatibleHttp?: HttpClient;
  /** The system the CLI runs on; `process.platform` by default. */
  readonly platform?: NodeJS.Platform;
  /** The variables every harness program gets; `PATH` and the locale from `process.env` by default. */
  readonly programEnvironment?: Readonly<Record<string, string>>;
}

/** The run you read an agent's file or a skill's text for: its id and the version it read. */
export interface VersionedRun {
  readonly runId: string;
  readonly version: RunVersion | null;
}

/**
 * Where the agents' files and skills' text of the version a run read come
 * from: the CLI's `WorkspaceVersions`, which stays in the CLI.
 */
export interface RunFileVersions {
  /**
   * The agent's `AGENTS.md` as the run's version holds it.
   *
   * @throws when the run's version can't be read or may not run here, or has no such agent
   */
  agentFileOf(run: VersionedRun, hubId: string, agentId: string): Promise<Uint8Array>;
  /**
   * The skill's text as the run's version holds it.
   *
   * @throws when the run's version can't be read or may not run here, or has no such skill
   */
  skillTextOf(run: VersionedRun, hubId: string, skillId: string): Promise<string>;
}

/** What {@link openLocalHarnessHost} builds from. */
export interface LocalHarnessInput {
  /** This Halonic's version, which Codex is told it runs under. */
  readonly halonicVersion: string;
  /** The workspace folder's real path: the choices in the profile are keyed by it. */
  readonly location: string;
  /** The workspace's folders in the profile. */
  readonly folders: WorkspaceFolders;
  readonly profile: ProfileFolder;
  readonly environment: ProfileEnvironment;
  /** The files the engine runs, read when a run starts, for where an agent runs and its folders. */
  workspace(): LoadedWorkspace;
  /**
   * The files a run read, when runs start from other versions than the
   * files on disk (`routines watch`): the placement check hashes the
   * agent's file from the run's version. Without it, from disk.
   */
  readonly versions?: RunFileVersions;
  /**
   * The agents' and skills' files of the version a run read, for `run` and
   * `runs send`, whose definitions come from the live version: the placement
   * check hashes the agent's file from there, and the instructions pin its
   * skills' text from there, never from disk (HAL-16386). `versions` wins.
   */
  readonly runFiles?: RunFileVersions;
  /** The workspace's files, which Accept writes and a proposal's base is read from. */
  readonly store: DefinitionStore;
  readonly digest: Digest;
  readonly clock: Clock;
  /** Which git makes the worktrees; the one on the `PATH` by default. */
  readonly git?: GitRunnerOptions;
  /** The runs the engine hasn't ended, whose folders stay at `start`; read only when a folder is left from before. */
  openRuns(): Promise<ReadonlySet<string>>;
  /** Hears the error of a folder's end that couldn't finish, and of a temp folder that couldn't be removed. */
  reportError(error: unknown): void;
  /** Hears of a harness bridge failure the run log couldn't record (requirement `harness-host.bridge-failures`). */
  reportBridgeError(error: unknown): void;
  /** Hears why the harness sandbox doesn't sweep kept Windows grants under the profile's host lock, or stopped. */
  reportHostLock(error: unknown): void;
  /** The CLI's remembered secrets, which a sandboxed agent's provider key is read from. */
  readonly secrets: Secrets;
  /** The addresses each saved key may be sent to. */
  readonly keyOrigins: KeyOrigins;
  /** Whether the command's trust check granted trust, so a key may go to a provider's own `baseUrl`. */
  readonly trusted: boolean;
  /**
   * Halonic's other ports on this computer, which a run's bridge never calls
   * a provider on: `serve`'s, where it runs. Read on every call.
   */
  readonly ownPorts?: () => Iterable<number>;
  /** Hears the access each harness agent's bridge got: the provider and the secret's name, never a value. */
  reportAccess?(agent: BridgeAgent, choice: ProviderAccessChoice): void;
  readonly parts?: LocalHarnessParts;
}

/** The harness host, open until {@link LocalHarnessHost.close}. */
export interface LocalHarnessHost extends Omit<HarnessHost, "start"> {
  /**
   * Clears what runs that ended while no engine was open left in the profile.
   * Call it once, under the engine lock, before the engine starts any run.
   * It never throws: an error goes to `reportError`, and the next start tries again.
   */
  start(): Promise<void>;
  /** Stops git, if it started, and gives the profile's host lock up, if it took it. Close it once the executor and the scheduler have closed. Safe to call twice. */
  close(): Promise<void>;
}
