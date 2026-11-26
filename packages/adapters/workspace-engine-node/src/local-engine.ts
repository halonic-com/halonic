// The engine for one workspace on this computer, without anything only the
// CLI says or starts (HAL-14217): the CLI's `cli-local-engine.ts` and the
// agent host's engine role open it with their own parts. Its runs, blobs
// and timers live in the person's profile folder, in the folders
// `engineStateFolders` finds, so `halonic runs` and the Studio read the
// same runs. It is a plain function of its inputs (Liam, HAL-3895) and
// never reads a printer, argv or `process`.
// What doesn't depend on Node (the executor on a scheduler of run timers, the
// routines, the close order) is `assembleEngine` of `@halonicjs/engine`
// (HAL-8792), which the desktop Studio shares; this file passes it the Node
// stores, scheduler and lock.
//
// Its caller gives it the harness host (`openHarnessHost`), which runs an
// agent in a harness and keeps what the run changed as a proposal, and the
// approvals of listed tools. Each top-level run starts its own connectors
// (`runConnectors`, HAL-6277) in the folder its programs start in:
// `programFolders`, a copy at the run's commit for a live run (HAL-4975).
// A chat turn calls the connectors it is given, none by default.
//
// Its runs read `workspace`, or, for an engine over several versions,
// the version each run records (`versions`, HAL-6084).

import { join } from "node:path";
import { NodeCoordination } from "@halonicjs/adapter-coordination-node";
import { randomLeaseToken } from "@halonicjs/adapter-coordination-node/node";
import {
  FileRecordStore,
  FolderBlobStore,
  FolderRunStore,
  type HeldLock,
  holdLock,
  LockHeldError,
  makePrivateFolder,
} from "@halonicjs/adapter-fs-node";
import type { GitRunnerOptions } from "@halonicjs/adapter-git";
import { openProgramFolders, type ProgramFolders } from "@halonicjs/adapter-program-copies-node";
import {
  nodeSchedulerFactory,
  type SchedulerErrorSource,
  type SetTimer,
} from "@halonicjs/adapter-scheduler-node";
import { systemSetTimer } from "@halonicjs/adapter-scheduler-node/node";
import {
  engineLockFile,
  routineStateCollection,
  runTimerCollection,
  workspaceBudget,
  workspaceExecutorOptions,
} from "@halonicjs/adapter-workspace-models";
import {
  assembleEngine,
  type HarnessRunsOptions,
  type ListedToolApproval,
  type LocalExecutor,
  type RoutineEngine,
  type RoutineTicks,
  type RunDefinitions,
  type RunProposalFolders,
} from "@halonicjs/engine";
import type { RunVersion } from "@halonicjs/events";
import type {
  Clock,
  ConnectorClient,
  Coordination,
  HttpClient,
  IdGenerator,
  KeyOrigins,
  RunStore,
  ScheduledTimer,
  Secrets,
  ToolScriptIsolate,
} from "@halonicjs/ports";
import type { ProfileEnvironment } from "@halonicjs/profile";
import { randomIds, systemClock } from "@halonicjs/std";
import {
  type LoadedWorkspace,
  type LocalIntegrationInput,
  runDefinitionsOf,
} from "@halonicjs/workspace";
import { EngineLockHeldError } from "./engine-lock-held.ts";
import { type EnginePlace, engineStateFolders } from "./engine-state-folders.ts";
import {
  type LocalRunConnectorsInput,
  localRunConnectors,
  type RunConnectorsEngine,
} from "./local-run-connectors.ts";

/**
 * What an error the engine handles itself came from: the scheduler, the
 * engine's lock, a leftover program copy it couldn't sweep, what a harness
 * run left, a harness bridge failure the run log couldn't record, or why the
 * harness sandbox doesn't sweep under the profile's host lock.
 */
export type EngineErrorSource =
  | SchedulerErrorSource
  | "engine-lock"
  | "program-copies"
  | "run-connectors"
  | "harness-host"
  | "harness-bridge"
  | "host-lock";

/** The harness host an engine runs harness agents on, open while the engine is. */
export interface EngineHarnessHost {
  readonly harnesses: HarnessRunsOptions;
  readonly proposalFolders: RunProposalFolders;
  /**
   * Clears what runs that ended while no engine was open left. Called once,
   * under the engine lock, before the engine starts any run.
   */
  start(): Promise<void>;
  /** Called once the executor and the scheduler have closed. Safe to call twice. */
  close(): Promise<void>;
}

/**
 * Opens the harness host of the engine at `place`. Called under the engine
 * lock, once the program folders are open.
 */
export type OpenEngineHarnessHost = (place: EnginePlace) => Promise<EngineHarnessHost>;

/**
 * The versions of the workspace an engine's runs read, as `halonic routines
 * watch` gives them: what the engine itself asks of them.
 */
export interface EngineVersions extends NonNullable<RunConnectorsEngine["versions"]> {
  /** The version read last, checked and trusted as `workspace` is. */
  latest(): LoadedWorkspace;
  /**
   * The definitions a new run of the workflow starts with, from `version`.
   *
   * @throws when the hub or the workflow isn't in that version, or that
   *   version may not run on this computer
   */
  definitionsOf(
    hubId: string,
    workflowId: string,
    version: RunVersion | undefined,
    runId: string,
  ): Promise<RunDefinitions>;
}

/** What {@link openLocalEngine} builds the engine from. */
export interface OpenLocalEngineInput {
  /** The loaded workspace, checked for errors and trusted before a run starts. */
  readonly workspace: LoadedWorkspace;
  /**
   * The local integrations a run's definitions take declared tools from,
   * when `versions` is left out: those of `workspace` a trust check approved.
   * Left out, none, and no tool takes a noun from a sheet, which fails safe.
   */
  readonly declaredToolIntegrations?: readonly LocalIntegrationInput[];
  /**
   * For an engine whose runs read more than one version of the workspace:
   * each run starts with the definitions of the version it records, and
   * models, chat agents and their connectors' tools come from the version
   * read last. Left out, everything reads `workspace`.
   */
  readonly versions?: EngineVersions;
  /** The workspace folder, as `openWorkspaceDir` found it. */
  readonly workspaceRoot: string;
  /** Where the profile folder is. */
  readonly environment: ProfileEnvironment;
  /** The secrets the engine's runs read, never a raw adapter. */
  readonly secrets: Secrets;
  /** The origins each stored key may be sent to, from the profile's secrets file. */
  readonly keyOrigins: KeyOrigins;
  /** What the model providers call their servers with. */
  readonly http: HttpClient;
  /**
   * Whether the trust check granted trust, so a provider's stored key may go to a
   * non-default address (HAL-11342). A run that can only reach the test model has none.
   */
  readonly trusted: boolean;
  /** Opens the harness host the engine's harness agents run on. */
  readonly openHarnessHost: OpenEngineHarnessHost;
  /**
   * The approvals of listed tools at `place`, read at the start of every
   * turn, from the version `latest` gives.
   */
  listedToolApproval(place: EnginePlace, latest: () => LoadedWorkspace): ListedToolApproval;
  /**
   * Hears every error the engine handles itself: one the scheduler handles,
   * such as a run's step that threw and will be retried, or one with the
   * engine's lock. Only a lost lock stops the engine, which then closes.
   */
  reportError(error: unknown, source: EngineErrorSource): void;
  /** Hears each scheduler wake-up that worked, so a count of failed wake-ups can start again. */
  onWokeUp?(): void;
  /** Hears each timer the engine handled, so a count of its failures can start again. */
  onTimerDone?(timer: ScheduledTimer): void;
  /**
   * Whether to leave a timer untried: it fails at once, and the scheduler
   * keeps it, so the next engine on the workspace tries it again (HAL-5294).
   */
  holdsTimer?(timer: ScheduledTimer): boolean;
  /** The connected servers a chat turn calls; none by default. */
  readonly connectors?: readonly ConnectorClient[];
  /**
   * What each top-level run starts its hub's connectors with, in the folder
   * its programs start in. Left out, a run calls no connector.
   */
  readonly runConnectors?: LocalRunConnectorsInput;
  /**
   * The words the engine's lock names its holder by, so whoever the lock
   * refuses can name it (HAL-14299). Left out, the lock names only the process.
   */
  readonly holder?: string;
  /** Which git makes the copies a live run's programs start in; the one on the `PATH` by default. */
  readonly git?: GitRunnerOptions;
  /** The time; the computer's clock by default. */
  readonly clock?: Clock;
  /** Gives each new run its id; random ids by default. */
  readonly ids?: IdGenerator;
  /** How the scheduler wakes itself up; Node's own timers by default. */
  readonly setTimer?: SetTimer;
  /**
   * Starts the workspace's routines on the scheduler's tick, once a minute.
   * Left out, a tick does nothing, as for `halonic run`.
   */
  readonly routines?: (engine: RoutineEngine) => RoutineTicks;
  /**
   * The isolate the workflows' `rule` steps run in. Left out, as for
   * `halonic run`, a run fails at its first rule step with an error that says so.
   */
  readonly toolScriptIsolate?: ToolScriptIsolate;
}

/** The engine of one workspace, open until {@link LocalEngine.close}. */
export interface LocalEngine {
  readonly executor: LocalExecutor;
  /** The workspace's run store, the one `halonic runs` reads. */
  readonly runs: RunStore;
  /** The engine's own time. */
  readonly clock: Clock;
  /** The engine's coordination, as {@link RoutineEngine} has it. */
  readonly coordination: Coordination;
  /** Where the programs of a run start: a copy at the run's commit for a live run. */
  readonly programFolders: ProgramFolders;
  /**
   * Closes the executor, then the scheduler, which waits for the step in
   * progress, removes the copies its runs' programs started in, and
   * releases the workspace's engine lock. Safe to call twice. A run that is still going stays in the run store; the next
   * engine on this workspace moves it on from its timers, or ends it as
   * `interrupted` when it was a harness run.
   */
  close(): Promise<void>;
  /**
   * Gives up on a {@link close} that hangs, such as on a model call that
   * doesn't stop: releases the workspace's engine lock now, though a step
   * may still be in progress. Only for a process that ends straight after,
   * which ends that step with it, so the next engine can open (HAL-6677).
   */
  abandon(): Promise<void>;
}

/**
 * Opens the engine of the workspace in `input.workspaceRoot`: the local
 * executor on the workspace's run store, blob store and a scheduler whose
 * timers survive a restart, with the workspace's models.
 *
 * It is the only engine on the workspace while it is open (HAL-4032): it
 * holds {@link engineLockFile} in the workspace's folder in the profile,
 * with the run lock's rules, so a second engine can't deliver the same
 * timer and make a model call twice. The lock of an engine that crashed is
 * taken over. Should another process take the lock over all the same,
 * because this one stalled for longer than the lock's stale limit, the
 * engine reports it and closes.
 *
 * @throws EngineLockHeldError when another engine is open on the workspace
 * @throws when the workspace folder doesn't exist, or `HALONIC_HOME` or the
 *   home folder isn't an absolute folder
 *
 * @example
 * const engine = await openLocalEngine({ workspace, workspaceRoot, environment, secrets, http, openHarnessHost, listedToolApproval, reportError });
 * await new WorkflowRuns(engine.executor).startRun(workspace, "support-reply", input);
 * await engine.close();
 */
export async function openLocalEngine(input: OpenLocalEngineInput): Promise<LocalEngine> {
  const place = await engineStateFolders(input.workspaceRoot, input.environment);
  const { folders } = place;
  // Private like the run files in it, which hold prompts and model output (HAL-5215).
  await makePrivateFolder(folders.folder);
  let engine: LocalEngine | undefined;
  const lock = await holdEngineLock(join(folders.folder, engineLockFile), {
    ...(input.holder === undefined ? {} : { holder: input.holder }),
    onLost: (error) => {
      input.reportError(error, "engine-lock");
      void engine?.close().catch((closeError) => input.reportError(closeError, "engine-lock"));
    },
    onRenewError: (error) => input.reportError(error, "engine-lock"),
  });
  let programFolders: ProgramFolders | undefined;
  let harnessHost: EngineHarnessHost | undefined;
  try {
    // Under the lock: it removes the copies a stopped engine left behind.
    programFolders = await openProgramFolders({
      workspaceRoot: input.workspaceRoot,
      copiesFolder: folders.programCopiesFolder(),
      reportError: (error) => input.reportError(error, "program-copies"),
      ...(input.git === undefined ? {} : { git: input.git }),
    });
    harnessHost = await input.openHarnessHost(place);
    // Before the engine can start a run: the folders of runs that ended while no engine was open go.
    await harnessHost.start();
    engine = engineOn(input, place, lock, programFolders, harnessHost);
    return engine;
  } catch (error) {
    try {
      await harnessHost?.close();
    } finally {
      try {
        await programFolders?.close();
      } finally {
        await lock.release();
      }
    }
    throw error;
  }
}

/** {@link holdLock} on the engine's lock, refusing with {@link EngineLockHeldError} when another engine holds it. */
async function holdEngineLock(
  file: string,
  options: Parameters<typeof holdLock>[1],
): Promise<HeldLock> {
  try {
    return await holdLock(file, options);
  } catch (error) {
    if (error instanceof LockHeldError) throw new EngineLockHeldError(error);
    throw error;
  }
}

/** The engine on the workspace's folders in the profile, which holds `lock` until it is closed. */
function engineOn(
  input: OpenLocalEngineInput,
  place: EnginePlace,
  lock: HeldLock,
  programFolders: ProgramFolders,
  harnessHost: EngineHarnessHost,
): LocalEngine {
  const { location, folders } = place;
  const clock = input.clock ?? systemClock;
  const runs = new FolderRunStore(folders.runsFolder());

  const { versions } = input;
  const latest = () => versions?.latest() ?? input.workspace;
  const connectors =
    input.runConnectors === undefined
      ? undefined
      : localRunConnectors(input.runConnectors, {
          workspace: input.workspace,
          ...(versions === undefined ? {} : { versions }),
          location,
          secrets: input.secrets,
          programFolders,
          reportError: (error) => input.reportError(error, "run-connectors"),
        });
  const assembled = assembleEngine({
    createScheduler: nodeSchedulerFactory({
      store: new FileRecordStore(folders.recordsFolder()),
      collection: runTimerCollection,
      clock,
      setTimer: input.setTimer ?? systemSetTimer,
      reportError: input.reportError,
      ...(input.onWokeUp === undefined ? {} : { onWokeUp: input.onWokeUp }),
    }),
    executor: {
      ...workspaceExecutorOptions({
        workspace: input.workspace,
        latest,
        secrets: input.secrets,
        http: input.http,
        clock,
        isTrusted: () => input.trusted,
        keyOrigins: input.keyOrigins,
        listedToolApproval: input.listedToolApproval(place, latest),
        ...(input.connectors === undefined ? {} : { connectors: input.connectors }),
      }),
      runs: {
        harnesses: harnessHost.harnesses,
        proposalFolders: harnessHost.proposalFolders,
        store: runs,
        blobs: new FolderBlobStore(folders.blobsFolder()),
        ids:
          input.ids ?? randomIds((count) => crypto.getRandomValues(new Uint8Array(count)), clock),
        definitionsOf: async (hubId, workflowId, version, runId) =>
          versions === undefined
            ? runDefinitionsOf(input.workspace, hubId, workflowId, input.declaredToolIntegrations)
            : await versions.definitionsOf(hubId, workflowId, version, runId),
        ...connectors?.runs,
        budget: workspaceBudget(latest),
        ...(input.toolScriptIsolate === undefined
          ? {}
          : { toolScriptIsolate: input.toolScriptIsolate }),
      },
    },
    // Kept in the workspace's folder in the profile, so the last tick and queues survive a restart.
    coordination: new NodeCoordination({
      store: new FileRecordStore(folders.recordsFolder()),
      collection: routineStateCollection,
      clock,
      newToken: randomLeaseToken,
    }),
    // Without routines, as for `halonic run`, a tick does nothing.
    ...(input.routines === undefined ? {} : { routines: input.routines }),
    ...(input.holdsTimer === undefined ? {} : { holdsTimer: input.holdsTimer }),
    ...(input.onTimerDone === undefined ? {} : { onTimerDone: input.onTimerDone }),
    // After the scheduler, so no step still has a program running in a copy.
    // Each runs even when an earlier one failed: git and the copies are released all the same.
    closers: [
      async () => connectors?.runs.runConnectors.closeAll(),
      // The runners are stopped: their temp folders go.
      async () => input.runConnectors?.dispose?.(),
      () => harnessHost.close(),
      () => programFolders.close(),
    ],
    // Last, so no other engine starts while this one still delivers a timer.
    release: () => lock.release(),
  });
  return { ...assembled, programFolders };
}
