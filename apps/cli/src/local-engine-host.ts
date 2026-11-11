// The engine for one workspace on this computer, as `halonic run` starts it
// (HAL-3814). Its runs, blobs and timers live in the person's profile folder,
// in the workspace's own folders, so `halonic runs` and the Studio read the
// same runs. It is a plain function of its inputs (Liam, HAL-3895) and never
// reads the CLI's printer, argv or `process`, so it can move into a package
// the Studio shares once the Studio starts runs.
//
// In 0.1 it has no Halonic tools and no harnesses (a run whose agent names a
// harness fails at that step with the engine's own error), and it has the
// connectors it is given, none by default.

import { realpath } from "node:fs/promises";
import { join } from "node:path";
import { NodeCoordination, randomLeaseToken } from "@halonicjs/adapter-coordination-node";
import {
  FileRecordStore,
  FolderBlobStore,
  FolderRunStore,
  type HeldLock,
  holdLock,
  LockHeldError,
  makePrivateFolder,
} from "@halonicjs/adapter-fs-node";
import {
  type NodeScheduler,
  nodeSchedulerFactory,
  type SchedulerErrorSource,
  type SetTimer,
  systemSetTimer,
} from "@halonicjs/adapter-scheduler-node";
import { LocalExecutor } from "@halonicjs/engine";
import type { Agent } from "@halonicjs/format";
import type {
  ChatTurnRequest,
  Clock,
  ConnectorClient,
  Coordination,
  HttpClient,
  IdGenerator,
  RunStore,
  ScheduledTimer,
  Secrets,
} from "@halonicjs/ports";
import {
  type ProfileEnvironment,
  profileFolder,
  type WorkspaceFolders,
  workspaceFolders,
} from "@halonicjs/profile";
import { KindedError, randomIds, systemClock } from "@halonicjs/std";
import {
  connectorToolsOf,
  definitionsOf,
  filesOf,
  type LoadedWorkspace,
  runDefinitionsOf,
} from "@halonicjs/workspace";
import { workspaceModelResolver } from "./workspace-model-resolver.ts";
import { nodeProfileEnvironment, webCryptoDigest } from "./workspace-runs.ts";

/** The collection of the workspace's record store that keeps the run timers. */
export const runTimerCollection = "halonic.run-timers";

/** The collection of the workspace's record store that keeps what the routine scheduler shares between ticks. */
export const routineStateCollection = "halonic.routine-state";

/** The file in the workspace's folder in the profile that the one engine on it holds. */
export const engineLockFile = "engine.lock";

/** What an error the engine handles itself came from: the scheduler, or the engine's lock. */
export type EngineErrorSource = SchedulerErrorSource | "engine-lock";

/** What {@link openLocalEngine} builds the engine from. */
export interface LocalEngineInput {
  /** The loaded workspace, checked for errors and trusted before a run starts. */
  readonly workspace: LoadedWorkspace;
  /** The workspace folder, as `openWorkspaceDir` found it. */
  readonly workspaceRoot: string;
  /** The CLI's remembered secrets, never a raw adapter (`apps/cli/AGENTS.md`). */
  readonly secrets: Secrets;
  /** What the model providers call their servers with. */
  readonly http: HttpClient;
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
   * keeps it, so the next engine on the workspace tries it again. For a run
   * `routines watch` gave up on and couldn't cancel (HAL-5294).
   */
  holdsTimer?(timer: ScheduledTimer): boolean;
  /** The connected servers of the workspace's connector files; none by default. */
  readonly connectors?: readonly ConnectorClient[];
  /** Where the profile folder is; this process's by default. */
  readonly environment?: ProfileEnvironment;
  /** The time; the computer's clock by default. */
  readonly clock?: Clock;
  /** Gives each new run its id; random ids by default. */
  readonly ids?: IdGenerator;
  /** How the scheduler wakes itself up; Node's own timers by default. */
  readonly setTimer?: SetTimer;
  /**
   * Starts the workspace's routines on the scheduler's tick, once a minute,
   * as `halonic routines watch` does. Left out, a tick does nothing, as for
   * `halonic run`.
   */
  readonly routines?: (engine: RoutineEngine) => RoutineTicks;
}

/** What the routine scheduler is built on: the engine's own parts. */
export interface RoutineEngine {
  readonly executor: LocalExecutor;
  readonly runs: RunStore;
  readonly clock: Clock;
  /** Kept in the workspace's folder in the profile, so the last tick and queues survive a restart. */
  readonly coordination: Coordination;
}

/** The routine scheduler as the engine drives it, such as `RoutineScheduler` of `@halonicjs/app`. */
export interface RoutineTicks {
  onTick(at: string): Promise<void>;
  /** Stops it starting runs, once a tick in progress has settled; called first when the engine closes. */
  dispose(): Promise<void>;
}

/** The engine of one workspace, open until {@link LocalEngine.close}. */
export interface LocalEngine {
  readonly executor: LocalExecutor;
  /** The workspace's run store, the one `halonic runs` reads. */
  readonly runs: RunStore;
  /**
   * Closes the executor, then the scheduler, which waits for the step in
   * progress, and releases the workspace's engine lock. Safe to call twice. A run that is still going stays in the run store; the next
   * engine on this workspace moves it on from its timers, or ends it as
   * `interrupted` when it was a harness run.
   */
  close(): Promise<void>;
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
 * @throws KindedError `conflict` when another engine is open on the workspace
 * @throws when the workspace folder doesn't exist, or `HALONIC_HOME` or the
 *   home folder isn't an absolute folder
 *
 * @example
 * const engine = await openLocalEngine({ workspace, workspaceRoot, secrets, http, reportError });
 * await new WorkflowRuns(engine.executor).startRun(workspace, "support-reply", input);
 * await engine.close();
 */
export async function openLocalEngine(input: LocalEngineInput): Promise<LocalEngine> {
  const folders = await workspaceFolders(
    profileFolder(input.environment ?? nodeProfileEnvironment()),
    await realpath(input.workspaceRoot),
    webCryptoDigest,
  );
  // Private like the run files in it, which hold prompts and model output (HAL-5215).
  await makePrivateFolder(folders.folder);
  let engine: LocalEngine | undefined;
  const lock = await holdEngineLock(join(folders.folder, engineLockFile), {
    onLost: (error) => {
      input.reportError(error, "engine-lock");
      void engine?.close().catch((closeError) => input.reportError(closeError, "engine-lock"));
    },
    onRenewError: (error) => input.reportError(error, "engine-lock"),
  });
  try {
    engine = engineOn(input, folders, lock);
    return engine;
  } catch (error) {
    await lock.release();
    throw error;
  }
}

/** The engine on the workspace's folders in the profile, which holds `lock` until it is closed. */
function engineOn(input: LocalEngineInput, folders: WorkspaceFolders, lock: HeldLock): LocalEngine {
  const clock = input.clock ?? systemClock;
  const runs = new FolderRunStore(folders.runsFolder());

  // The scheduler's listener needs the executor and the routines, and they
  // need the scheduler, so the listener looks them up when it is called.
  let executor: LocalExecutor | undefined;
  let routines: RoutineTicks | undefined;
  const scheduler: NodeScheduler = nodeSchedulerFactory({
    store: new FileRecordStore(folders.recordsFolder()),
    collection: runTimerCollection,
    clock,
    setTimer: input.setTimer ?? systemSetTimer,
    reportError: input.reportError,
    ...(input.onWokeUp === undefined ? {} : { onWokeUp: input.onWokeUp }),
  })({
    onTimer: async (timer) => {
      if (executor === undefined) {
        // The scheduler retries the timer once the executor is there.
        throw new Error("The engine is still starting; the timer is tried again.");
      }
      if (input.holdsTimer?.(timer) === true) {
        // Rejected, not resolved: the scheduler would remove a timer that resolved.
        throw new Error("The watch gave up on this run; its timer waits for the next engine.");
      }
      await executor.onTimer(timer);
      input.onTimerDone?.(timer);
    },
    // Without routines, as for `halonic run`, a tick does nothing. A tick
    // before they are built is missed; the next one catches up.
    onTick: async (at) => {
      await routines?.onTick(at);
    },
  });
  executor = new LocalExecutor({
    resolveModel: workspaceModelResolver(input),
    halonicTools: [],
    connectors: input.connectors ?? [],
    secrets: input.secrets,
    clock,
    // A chat turn reads the workspace's files as a run does: its agent's file,
    // and its connector files' `allow` and `approve` lists (HAL-5645).
    chatAgentOf: async (request) => chatAgentOf(input.workspace, request),
    chatConnectorToolsOf: async (request) =>
      connectorToolsOf(definitionsOf(input.workspace, request.hubId)),
    // Without a workspace.yaml that parsed, the format default: not local only.
    localOnly: filesOf(input.workspace, "workspace")[0]?.value.privacy.localOnly === true,
    runs: {
      store: runs,
      blobs: new FolderBlobStore(folders.blobsFolder()),
      scheduler,
      ids: input.ids ?? randomIds((count) => crypto.getRandomValues(new Uint8Array(count)), clock),
      definitionsOf: async (hubId, workflowId) =>
        runDefinitionsOf(input.workspace, hubId, workflowId),
    },
  });
  const opened = executor;
  routines = input.routines?.({
    executor: opened,
    runs,
    clock,
    coordination: new NodeCoordination({
      store: new FileRecordStore(folders.recordsFolder()),
      collection: routineStateCollection,
      clock,
      newToken: randomLeaseToken,
    }),
  });
  const ticks = routines;
  let closing: Promise<void> | undefined;
  return {
    executor: opened,
    runs,
    close: () => {
      closing ??= (async () => {
        try {
          // First, so no routine run starts on an executor that is closing.
          await ticks?.dispose();
          // Before the scheduler: its close waits for the deliveries in progress.
          await opened.close();
          await scheduler.close();
        } finally {
          // Last, so no other engine starts while this one still delivers a timer.
          await lock.release();
        }
      })();
      return closing;
    },
  };
}

/** The file of the agent a chat turn names, or `undefined` when the hub has none by that id. */
function chatAgentOf(workspace: LoadedWorkspace, request: ChatTurnRequest): Agent | undefined {
  const { agents } = definitionsOf(workspace, request.hubId);
  return request.agentId !== undefined && Object.hasOwn(agents, request.agentId)
    ? agents[request.agentId]
    : undefined;
}

/**
 * Takes the engine's lock, or refuses with a `conflict` the CLI can show:
 * the lock's own error names a path in the profile, so it is only the cause.
 */
async function holdEngineLock(
  file: string,
  options: Parameters<typeof holdLock>[1],
): Promise<HeldLock> {
  try {
    return await holdLock(file, options);
  } catch (error) {
    if (!(error instanceof LockHeldError)) {
      throw error;
    }
    const who = error.holder === null ? "" : ` (process ${error.holder.pid})`;
    throw new KindedError("conflict", `Another Halonic engine is open on this workspace${who}.`, {
      fix: "Wait until it has finished or stop it, then run again.",
      cause: error,
    });
  }
}
