// The engine of the open workspace, run in the Studio's page (HAL-10236). It
// is the CLI's engine with the page's parts: the shell's stores for runs,
// blobs and records (the same files the CLI reads), the keychain for secrets,
// and the shell's engine lock, which the page takes on the first start or send
// and keeps until the workspace changes or the window closes. When the shell
// loses the lock to another process (the computer slept and the CLI took
// over), the engine closes, as the CLI's does, so no run goes on twice. What doesn't
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
// Nothing starts from a workspace that isn't trusted, unless it reaches only
// the test model, the CLI's rule (HAL-1984, HAL-12409): the engine checks it
// on the workspace it loaded, when it opens and before each start, and it
// closes when the trust is removed while it is open (HAL-12799), ending the runs it stopped
// right then, so no page keeps saying they're going (HAL-13678).

import { NodeCoordination } from "@halonicjs/adapter-coordination-node";
import { TauriBlobStore, TauriRecordStore, TauriRunStore } from "@halonicjs/adapter-fs-tauri";
import { nodeSchedulerFactory } from "@halonicjs/adapter-scheduler-node";
import {
  routineStateCollection,
  runTimerCollection,
  type WorkflowRef,
  workflowAgentsOf,
  workspaceBudget,
  workspaceExecutorOptions,
} from "@halonicjs/adapter-workspace-models";
import type { startOfDueRun } from "@halonicjs/app";
import {
  type AssembledEngine,
  assembleEngine,
  endStoppedRuns,
  type LocalExecutor,
  noListedToolApproval,
} from "@halonicjs/engine";
import type { Agent } from "@halonicjs/format";
import { isAgentRunsNotAvailable, type RunExecutor } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import {
  filesOf,
  type LoadedWorkspace,
  loadWorkspace,
  runDefinitionsOf,
} from "@halonicjs/workspace";
import { type EngineLockHold, holdEngineLock } from "./engine-lock.ts";
import type { EngineServiceOptions } from "./engine-service-options.ts";
import {
  type PageRefusal,
  runCommandOf,
  startRefusal,
  WindowCantStart,
  whyThePageCantStart,
} from "./page-refusal.ts";
import type { EngineDecisions, StudioHarnessHost } from "./studio-harness-host.ts";

export type { PageEngineLock } from "./engine-lock.ts";

/** What a routine starts, with its placeholders filled in: what the routine scheduler would start. */
export type RoutineRunStart = ReturnType<typeof startOfDueRun>;

/**
 * The typed cause of a run the engine stopped because the workspace's trust was removed; the run
 * page's banner says so by this code (`runs.run-view.trust-removed`).
 */
export const trustRemovedCause = { kind: "denied", code: "workspace.trust-removed" } as const;

/** The hub's agent a routine starts. */
export interface AgentRef {
  readonly hubId: string;
  readonly agentId: string;
}

/** The open workspace's engine service, provided by the app. */
export const engineServiceKey: ServiceKey<EngineService> =
  serviceKey<EngineService>("studio.engine");

export type { EngineServiceOptions } from "./engine-service-options.ts";

/** An open engine and the workspace it was built on. */
interface OpenEngine {
  readonly engine: AssembledEngine;
  readonly workspace: LoadedWorkspace;
  readonly lock: EngineLockHold;
}

/** The engine of one workspace in the page, opened on first use. */
export class EngineService {
  readonly #options: EngineServiceOptions;
  #opening: Promise<OpenEngine> | undefined;
  /** Ending the runs an engine closed for a removed trust stopped; the next engine opens after it. */
  #ending: Promise<void> = Promise.resolve();
  readonly #stopHearingTrust: (() => void) | undefined;

  constructor(options: EngineServiceOptions) {
    this.#options = options;
    this.#stopHearingTrust = options.onTrustChange?.(() => {
      this.#closeIfUntrusted().catch((error: unknown) => options.reportError(error));
    });
  }

  /**
   * The engine, opening it on the first call: takes the shell's engine lock,
   * then builds the engine on the workspace's files. Later calls give the
   * same engine. A call that fails leaves nothing held, so the next call tries again.
   *
   * @throws KindedError `conflict` when another engine, the CLI's or another
   *   window's, holds the workspace's lock, or `denied` when the workspace may start nothing
   */
  async open(): Promise<AssembledEngine> {
    return (await this.#open()).engine;
  }

  #open(): Promise<OpenEngine> {
    this.#opening ??= this.#openOnce().catch((error: unknown) => {
      this.#opening = undefined;
      throw error;
    });
    return this.#opening;
  }

  /**
   * The open engine, for a start: refuses when its workspace may start nothing now, such as after
   * a person removed their trust while the engine was open.
   *
   * @throws KindedError `denied`, or what {@link EngineService.open} throws
   */
  async #forStart(): Promise<AssembledEngine> {
    const { engine, workspace } = await this.#open();
    await this.#refuseUntrusted(workspace);
    return engine;
  }

  /**
   * Refuses, failing closed, a workspace that isn't trusted and reaches more than the test model.
   *
   * @throws KindedError `denied`
   */
  async #refuseUntrusted(workspace: LoadedWorkspace): Promise<void> {
    const may = await this.#options.mayStart(workspace).catch(() => false);
    if (!may) {
      throw new KindedError("denied", "This workspace isn't trusted yet, so nothing was started.");
    }
  }

  /**
   * Refuses a workflow the page can't run, before the engine opens: one with
   * an agent that lists a connector, or an agent in a harness when no agent
   * host runs.
   *
   * @throws KindedError `unavailable` naming the agent in a harness, with its Harness page step
   * @throws StartInTerminal naming the agent with a connector, with the command that starts the
   *   run in a terminal
   * @throws RangeError when the hub or the workflow doesn't exist
   */
  async check(run: WorkflowRef): Promise<void> {
    const workspace = await loadWorkspace(this.#options.definitions);
    runDefinitionsOf(workspace, run.hubId, run.workflowId);
    for (const { value: agent } of workflowAgentsOf(workspace, run)) {
      const refusal = this.#whyThePageCantStart(agent);
      if (refusal !== undefined) throw startRefusal(refusal, runCommandOf(workspace, run));
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
    const refusal = this.#whyThePageCantStart(file.value);
    if (refusal !== undefined) throw new WindowCantStart(refusal.reason);
  }

  /**
   * Starts a run of the workflow with `input`, on the workspace's files as they are saved: refuses
   * what the page can't run ({@link EngineService.check}), opens the engine, and returns once the
   * run has started, not when it ends. The run records a manual trigger, or an `inbox` one for a
   * request from the Inbox's form.
   *
   * @param from where the person started it: with Run (`manual`, the default) or from the Inbox
   * @returns the new run's id
   * @throws what {@link EngineService.check} and {@link EngineService.open} throw, or the
   *   executor's refusal of the input
   */
  async startRun(
    run: WorkflowRef,
    input: Record<string, unknown>,
    from: "manual" | "inbox" = "manual",
  ): Promise<{ readonly id: string }> {
    await this.check(run);
    const engine = await this.#forStart();
    // A run started from the window is the person's own, so it names a trigger: with none, the
    // Runs list says it was started in the terminal.
    const trigger = { type: from, at: this.#options.clock.now().toISOString() };
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
      const { executor } = await this.#forStart();
      const { id } = await executor.start({ ...start.workflow, trigger: runTrigger });
      return { id };
    }
    await this.checkAgent(start.agent);
    // As the port: the local executor's own `startAgent` takes no request until agent runs are built.
    const executor: RunExecutor = (await this.#forStart()).executor;
    try {
      const { id } = await executor.startAgent({ ...start.agent, trigger: runTrigger });
      return { id };
    } catch (error) {
      if (!isAgentRunsNotAvailable(error)) throw error;
      throw new KindedError("unavailable", "This window can't start an agent yet.");
    }
  }

  /** Answers a waiting run (an Inbox Approve or Reject) as `halonic runs send` does, with a start's checks. */
  async send(...args: Parameters<LocalExecutor["send"]>): ReturnType<LocalExecutor["send"]> {
    return (await this.#forStart()).executor.send(...args);
  }

  /**
   * Closes the engine, if open, and gives the workspace's lock back, as when
   * the workspace changes. Safe to call twice; a later {@link open} starts afresh.
   */
  async close(): Promise<void> {
    const opening = this.#opening;
    this.#opening = undefined;
    const open = await opening?.catch(() => undefined);
    await open?.engine.close();
    await this.#ending.catch(() => undefined);
  }

  /** Lets the workspace's service registry close the engine with the workspace. */
  dispose(): Promise<void> {
    this.#stopHearingTrust?.();
    return this.close();
  }

  /**
   * Closes the open engine, as {@link EngineService.close} does, when the workspace it loaded may
   * start nothing now: its runs in progress stop, and no timer of theirs, harness step included,
   * runs again in this window. Then it ends those runs at once, as failed with the trust's cause,
   * rather than when an engine next opens, which an untrusted workspace never does (HAL-13678).
   * A check that rejects is a no.
   */
  async #closeIfUntrusted(): Promise<void> {
    const opening = this.#opening;
    if (opening === undefined) return;
    const open = await opening.catch(() => undefined);
    if (open === undefined) return;
    const may = await this.#options.mayStart(open.workspace).catch(() => false);
    // Not when the engine was closed or opened afresh meanwhile: that one was checked as it opened.
    if (may || this.#opening !== opening) return;
    this.#opening = undefined;
    this.#ending = this.#closeAndEndStoppedRuns(open);
    await this.#ending;
  }

  /**
   * Closes `open`'s engine and ends the runs it stopped, holding the workspace's lock until they
   * are ended: an engine that took the lock in between, the CLI's or another window's, could have
   * started a run this would end while it is going (`end-interrupted-runs.ts`). For the same
   * reason it ends nothing once another process took the lock over.
   */
  async #closeAndEndStoppedRuns({ engine, lock }: OpenEngine): Promise<void> {
    const { ipc, location, clock } = this.#options;
    lock.kept = true;
    try {
      await engine.close();
      if (lock.lost) return;
      await endStoppedRuns(new TauriRunStore(ipc, location), clock, trustRemovedCause);
    } finally {
      await lock.held.release();
    }
  }

  /**
   * Why the page can't start an agent: it lists a connector, or it runs in a harness program
   * when no agent host runs. `undefined` when the page can start it.
   */
  #whyThePageCantStart(agent: Agent): PageRefusal | undefined {
    return whyThePageCantStart(agent, this.#options.openHarnessHost !== undefined);
  }

  /**
   * The harness host, or none when no agent host runs or it can't be reached
   * now. Without one the engine still opens for the workflows that need none,
   * and a run of an agent in a harness fails at its harness step.
   */
  async #openHarnessHost(decisions: EngineDecisions): Promise<StudioHarnessHost | undefined> {
    try {
      return await this.#options.openHarnessHost?.(decisions);
    } catch (error) {
      this.#options.reportError(error);
      return undefined;
    }
  }

  async #openOnce(): Promise<OpenEngine> {
    const { ipc, location, name, clock, reportError } = this.#options;
    // After the runs a removed trust stopped are ended, whose closer gives the lock back then.
    await this.#ending.catch(() => undefined);
    // When the shell later loses the lock, the engine closes, so the other process's engine is
    // the only one left on the workspace.
    const lock = await holdEngineLock(this.#options.lock, name, (lost) => {
      reportError(lost);
      this.close().catch(reportError);
      this.#options.onLockLost?.();
    });
    try {
      const workspace = await loadWorkspace(this.#options.definitions);
      // Before the scheduler and the harness host start, so an untrusted workspace's
      // routines don't fire and its open harness runs don't resume either.
      await this.#refuseUntrusted(workspace);
      const runStore = new TauriRunStore(ipc, location);
      // Set once the engine is built; a bridge opens only during a run, so after that.
      let executor: LocalExecutor | undefined;
      const harnessHost = await this.#openHarnessHost({
        approvalsOf: (runId) => executor?.bridgeApprovals(runId),
        remoteDecisionsOf: (runId) => executor?.bridgeRemoteDecisions(runId),
      });
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
            keyOrigins: this.#options.keyOrigins,
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
            // Each harness step asks again, so trust removed where this window doesn't hear it
            // (`halonic trust --remove`) still starts no harness program (HAL-12811). The trust
            // itself, not `mayStart`: a resumed run's step runs from its kept definitions, which
            // can have a harness agent the loaded workspace no longer has.
            mayStartHarness: () => this.#options.isTrusted(workspace).catch(() => false),
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
        release: async () => {
          if (!lock.kept) await lock.held.release();
        },
      });
      executor = engine.executor;
      return { engine, workspace, lock };
    } catch (error) {
      await lock.held.release();
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
