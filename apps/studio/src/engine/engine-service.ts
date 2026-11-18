// The engine of the open workspace, run in the Studio's page (HAL-10236). It
// is the CLI's engine with the page's parts: the shell's stores for runs,
// blobs and records (the same files the CLI reads), the keychain for secrets,
// and the shell's engine lock, which the page takes on the first start or send
// and keeps until the workspace changes or the window closes. What doesn't
// depend on the runtime (the executor's options, the collection names, the
// close order) is shared with the CLI: `workspaceExecutorOptions` and
// `assembleEngine`.
//
// The page calls model servers through the shell's `http_fetch` (the options'
// `http`), not its own `fetch`, which the window's content policy stops. The
// shell checks every address and every redirect hop, and a key never goes
// through the webview's network layer (the page still reads it from `secrets`).
// The page starts no connector: a workflow with an agent that lists one is
// refused as `unavailable` before the engine opens. Agents in a harness run in
// the agent host's sandbox (`openHarnessHost`, HAL-10849); where no agent host
// runs, a workflow with one is refused the same way.

import { NodeCoordination } from "@halonicjs/adapter-coordination-node";
import { TauriBlobStore, TauriRecordStore, TauriRunStore } from "@halonicjs/adapter-fs-tauri";
import { nodeSchedulerFactory, type SetTimer } from "@halonicjs/adapter-scheduler-node";
import {
  routineStateCollection,
  runTimerCollection,
  startsAProgram,
  type WorkflowRef,
  workflowAgentsOf,
  workspaceBudget,
  workspaceExecutorOptions,
} from "@halonicjs/adapter-workspace-models";
import type { startOfDueRun } from "@halonicjs/app";
import {
  type AssembledEngine,
  assembleEngine,
  type LocalExecutor,
  noListedToolApproval,
} from "@halonicjs/engine";
import type { Agent } from "@halonicjs/format";
import {
  type BridgeApprovals,
  type Clock,
  type DefinitionStore,
  type HttpClient,
  type IdGenerator,
  isAgentRunsNotAvailable,
  noKeyOrigins,
  type RunExecutor,
  type Secrets,
} from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import type { TauriIpc } from "@halonicjs/studio-services";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import {
  filesOf,
  type LoadedWorkspace,
  loadWorkspace,
  runDefinitionsOf,
} from "@halonicjs/workspace";
import type { StudioHarnessHost } from "./studio-harness-host.ts";

/** What a routine starts, with its placeholders filled in: what the routine scheduler would start. */
export type RoutineRunStart = ReturnType<typeof startOfDueRun>;

/** The hub's agent a routine starts. */
export interface AgentRef {
  readonly hubId: string;
  readonly agentId: string;
}

/** The open workspace's engine service, provided by the app. */
export const engineServiceKey: ServiceKey<EngineService> =
  serviceKey<EngineService>("studio.engine");

/** What an {@link EngineService} is built from. */
export interface EngineServiceOptions {
  /** The shell: its run, blob and record commands and the engine lock. */
  readonly ipc: TauriIpc;
  /** The workspace folder, as the person opened it in the shell. */
  readonly location: string;
  /** The workspace's files, read when the engine opens. */
  readonly definitions: DefinitionStore;
  /** The keychain, as `Secrets`. */
  readonly secrets: Secrets;
  /** What the model providers call their servers with. */
  readonly http: HttpClient;
  readonly clock: Clock;
  /**
   * Whether the workspace, as the engine loaded it, is trusted on this computer. Asked on every
   * model call, so a provider's stored key goes to a non-default address only after a person
   * trusted exactly these files (HAL-11342).
   */
  readonly isTrusted: (workspace: LoadedWorkspace) => Promise<boolean>;
  readonly ids: IdGenerator;
  /** How the scheduler wakes itself up. */
  readonly setTimer: SetTimer;
  /** A new token for the routine state's leases. */
  readonly newToken: () => string;
  /** Hears each error the engine handles itself, such as a timer that will be retried. */
  reportError(error: unknown): void;
  /**
   * Builds the harness host on the agent host, when one runs (`openStudioHarnessHost`).
   * `approvalsOf` gives one run's bridge approvals, the engine's once it is built.
   * Without it, a workflow with an agent in a harness is refused.
   */
  openHarnessHost?(
    approvalsOf: (runId: string) => BridgeApprovals | undefined,
  ): Promise<StudioHarnessHost>;
}

/** The engine of one workspace in the page, opened on first use. */
export class EngineService {
  readonly #options: EngineServiceOptions;
  #opening: Promise<AssembledEngine> | undefined;

  constructor(options: EngineServiceOptions) {
    this.#options = options;
  }

  /**
   * The engine, opening it on the first call: takes the shell's engine lock,
   * then builds the engine on the workspace's files. Later calls give the
   * same engine. A call that fails leaves nothing held, so the next call tries again.
   *
   * @throws KindedError `conflict` when another engine, the CLI's or another
   *   window's, holds the workspace's lock
   */
  open(): Promise<AssembledEngine> {
    this.#opening ??= this.#openOnce().catch((error: unknown) => {
      this.#opening = undefined;
      throw error;
    });
    return this.#opening;
  }

  /**
   * Refuses a workflow the page can't run, before the engine opens: one with
   * an agent that lists a connector, or an agent in a harness when no agent
   * host runs.
   *
   * @throws KindedError `unavailable` naming the agent
   * @throws RangeError when the hub or the workflow doesn't exist
   */
  async check(run: WorkflowRef): Promise<void> {
    const workspace = await loadWorkspace(this.#options.definitions);
    runDefinitionsOf(workspace, run.hubId, run.workflowId);
    for (const { value: agent } of workflowAgentsOf(workspace, run)) {
      this.#refuseWhatThePageCantStart(agent);
    }
  }

  /**
   * Refuses an agent a routine starts on its own that the page can't run, before the engine
   * opens, as {@link EngineService.check} refuses a workflow's agents.
   *
   * @throws KindedError `unavailable` naming the agent
   * @throws RangeError when the hub has no such agent
   */
  async checkAgent({ hubId, agentId }: AgentRef): Promise<void> {
    const workspace = await loadWorkspace(this.#options.definitions);
    const file = filesOf(workspace, "agent").find(
      (agent) => agent.hub === hubId && agent.value.id === agentId,
    );
    if (file === undefined) {
      throw new RangeError(`The hub "${hubId}" has no agent "${agentId}".`);
    }
    this.#refuseWhatThePageCantStart(file.value);
  }

  /**
   * Starts a run of the workflow with `input`, on the workspace's files as they are saved: refuses
   * what the page can't run ({@link EngineService.check}), opens the engine, and returns once the
   * run has started, not when it ends. The run records a manual trigger.
   *
   * @returns the new run's id
   * @throws what {@link EngineService.check} and {@link EngineService.open} throw, or the
   *   executor's refusal of the input
   */
  async startRun(
    run: WorkflowRef,
    input: Record<string, unknown>,
  ): Promise<{ readonly id: string }> {
    await this.check(run);
    const engine = await this.open();
    // A run started from the window is the person's own, so it names a manual trigger: with none,
    // the Runs list says it was started in the terminal.
    const trigger = { type: "manual" as const, at: this.#options.clock.now().toISOString() };
    const { id } = await engine.executor.start({ ...run, input, trigger });
    return { id };
  }

  /**
   * Starts what a routine runs, for its Run now: a workflow is checked as {@link EngineService.startRun}
   * checks it, an agent as {@link EngineService.checkAgent} checks it, both before the engine opens. The run records a manual trigger that names the routine, so the routine finds its own
   * runs again.
   *
   * @param trigger the routine's key and the time the person asked for the run
   * @returns the new run's id
   * @throws KindedError `unavailable` when the target is an agent, because agent runs aren't built yet
   *   (`ports.agent-runs-not-available`), or what {@link EngineService.startRun} throws
   */
  async startRoutine(
    start: RoutineRunStart,
    trigger: { readonly routineKey: string; readonly at: string },
  ): Promise<{ readonly id: string }> {
    const runTrigger = { type: "manual" as const, routineId: trigger.routineKey, at: trigger.at };
    if ("workflow" in start) {
      const { hubId, workflowId } = start.workflow;
      await this.check({ hubId, workflowId });
      const { executor } = await this.open();
      const { id } = await executor.start({ ...start.workflow, trigger: runTrigger });
      return { id };
    }
    await this.checkAgent(start.agent);
    // As the port: the local executor's own `startAgent` takes no request until agent runs are built.
    const executor: RunExecutor = (await this.open()).executor;
    try {
      const { id } = await executor.startAgent({ ...start.agent, trigger: runTrigger });
      return { id };
    } catch (error) {
      if (!isAgentRunsNotAvailable(error)) throw error;
      throw new KindedError("unavailable", "This window can't start an agent yet.", {
        fix: "Run this routine from the command line.",
      });
    }
  }

  /**
   * Closes the engine, if open, and gives the workspace's lock back, as when
   * the workspace changes. Safe to call twice; a later {@link open} starts afresh.
   */
  async close(): Promise<void> {
    const opening = this.#opening;
    this.#opening = undefined;
    if (opening === undefined) return;
    const engine = await opening.catch(() => undefined);
    await engine?.close();
  }

  /** Lets the workspace's service registry close the engine with the workspace. */
  dispose(): Promise<void> {
    return this.close();
  }

  /**
   * Refuses an agent the page can't start: one that lists a connector, or one in a harness
   * program when no agent host runs.
   */
  #refuseWhatThePageCantStart(agent: Agent): void {
    if (startsAProgram(agent.harness) && this.#options.openHarnessHost === undefined) {
      throw new WindowCantStart(agent.name, "runs in a harness program");
    }
    if (agent.connectors.length > 0) {
      throw new WindowCantStart(agent.name, "uses a connector");
    }
  }

  /**
   * The harness host, or none when no agent host runs or it can't be reached
   * now. Without one the engine still opens for the workflows that need none,
   * and a run of an agent in a harness fails at its harness step.
   */
  async #openHarnessHost(
    approvalsOf: (runId: string) => BridgeApprovals | undefined,
  ): Promise<StudioHarnessHost | undefined> {
    try {
      return await this.#options.openHarnessHost?.(approvalsOf);
    } catch (error) {
      this.#options.reportError(error);
      return undefined;
    }
  }

  async #openOnce(): Promise<AssembledEngine> {
    const { ipc, location, clock, reportError } = this.#options;
    await holdLock(ipc, location);
    try {
      const workspace = await loadWorkspace(this.#options.definitions);
      const runStore = new TauriRunStore(ipc, location);
      // Set once the engine is built; a bridge opens only during a run, so after that.
      let executor: LocalExecutor | undefined;
      const harnessHost = await this.#openHarnessHost((runId) => executor?.bridgeApprovals(runId));
      await harnessHost?.start(await openRunsOf(runStore));
      const engine = assembleEngine({
        createScheduler: nodeSchedulerFactory({
          store: new TauriRecordStore(ipc, location),
          collection: runTimerCollection,
          clock,
          setTimer: this.#options.setTimer,
          reportError,
        }),
        executor: {
          ...workspaceExecutorOptions({
            workspace,
            secrets: this.#options.secrets,
            http: this.#options.http,
            clock,
            isTrusted: () => this.#options.isTrusted(workspace),
            // The desktop keychain keeps no origin list yet, so its keys stay on the trust rule.
            keyOrigins: noKeyOrigins,
            // Until Studio has its approval store (HAL-850 step 6), no listed tool is offered.
            listedToolApproval: noListedToolApproval,
          }),
          runs: {
            store: runStore,
            blobs: new TauriBlobStore(ipc, location),
            ids: this.#options.ids,
            definitionsOf: async (hubId, workflowId) =>
              runDefinitionsOf(workspace, hubId, workflowId),
            budget: workspaceBudget(() => workspace),
            ...(harnessHost === undefined
              ? {}
              : {
                  harnesses: harnessHost.harnesses,
                  proposalFolders: harnessHost.proposalFolders,
                }),
          },
        },
        coordination: new NodeCoordination({
          store: new TauriRecordStore(ipc, location),
          collection: routineStateCollection,
          clock,
          newToken: this.#options.newToken,
        }),
        // Last, so no other engine starts while this one still delivers a timer.
        release: () => releaseLock(ipc, location),
      });
      executor = engine.executor;
      return engine;
    } catch (error) {
      await releaseLock(ipc, location);
      throw error;
    }
  }
}

/**
 * The runs the engine hasn't ended, whose proposal folders stay at the
 * host's start: those waiting for a person, and those it will end as
 * interrupted on its first run.
 */
async function openRunsOf(runs: TauriRunStore): Promise<ReadonlySet<string>> {
  const open = await runs.list({ status: ["running", "waiting"] });
  return new Set(open.map((run) => run.id));
}

/** Takes the shell's engine lock, or refuses with a `conflict` that names the other process. */
async function holdLock(ipc: TauriIpc, location: string): Promise<void> {
  try {
    await ipc.invoke("engine_lock_hold", { workspace: location });
  } catch (refusal) {
    throw lockRefusal(refusal);
  }
}

async function releaseLock(ipc: TauriIpc, location: string): Promise<void> {
  await ipc.invoke("engine_lock_release", { workspace: location });
}

/** The shell's refusal as an error: `conflict` for a lock another engine holds, else `unavailable`. */
function lockRefusal(refusal: unknown): KindedError {
  const { kind, message, pid } = refusalOf(refusal);
  if (kind === "conflict") {
    const holder = pid === undefined ? "another engine" : `another engine (process ${pid})`;
    return new KindedError("conflict", `This workspace is open in ${holder}.`, {
      fix: "Close it, then try again.",
      cause: refusal,
    });
  }
  return new KindedError("unavailable", message ?? "The workspace's engine can't start here.", {
    cause: refusal,
  });
}

function refusalOf(refusal: unknown): { kind?: string; message?: string; pid?: number } {
  if (typeof refusal !== "object" || refusal === null) return {};
  const { kind, message, pid } = refusal as Record<string, unknown>;
  return {
    ...(typeof kind === "string" ? { kind } : {}),
    ...(typeof message === "string" ? { message } : {}),
    ...(typeof pid === "number" ? { pid } : {}),
  };
}

/**
 * The page's refusal of an agent it can't start: `unavailable`, like an engine that can't be
 * reached, but its own class, so a caller tells "this window can't start it" from "the engine
 * isn't answering" and shows its words.
 */
export class WindowCantStart extends KindedError {
  constructor(agentName: string, why: string) {
    super("unavailable", `${agentName} ${why}, which this window can't start yet.`, {
      fix: "Run this workflow from the command line.",
    });
  }
}
