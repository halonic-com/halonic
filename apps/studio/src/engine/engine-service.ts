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
// closes when the trust is removed while it is open (HAL-12799).

import { NodeCoordination } from "@halonicjs/adapter-coordination-node";
import {
  TauriBlobStore,
  type TauriHeldEngineLock,
  TauriRecordStore,
  TauriRunStore,
} from "@halonicjs/adapter-fs-tauri";
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
import type { EngineDecisions, StudioHarnessHost } from "./studio-harness-host.ts";

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

/** The workspace's engine lock, as the shell holds it for the page (`TauriEngineLock`). */
export interface PageEngineLock {
  /**
   * Holds the lock until it is released; `onLost` hears once if another process takes it over.
   *
   * @throws KindedError `conflict` whose `cause` is the shell's refusal, with the other process's `pid`
   */
  hold(onLost: (error: Error) => void): Promise<TauriHeldEngineLock>;
}

/** What an {@link EngineService} is built from. */
export interface EngineServiceOptions {
  /** The shell: its run, blob and record commands. */
  readonly ipc: TauriIpc;
  /** The workspace's engine lock, which the shell holds and renews. */
  readonly lock: PageEngineLock;
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
   * trusted exactly these files (HAL-11342), and right before each harness step (HAL-12811).
   */
  readonly isTrusted: (workspace: LoadedWorkspace) => Promise<boolean>;
  /**
   * Whether anything may start from the workspace, as the engine loaded it: it is trusted on this
   * computer, or it reaches only the test model. Asked when the engine opens and before each
   * start; a check that rejects is a no.
   */
  readonly mayStart: (workspace: LoadedWorkspace) => Promise<boolean>;
  /**
   * Calls `listener` whenever the workspace's trust may have changed, such as when a person
   * removes it; returns the way to stop. The open engine then asks {@link mayStart} again and
   * closes on a no (HAL-12799).
   */
  onTrustChange?(listener: () => void): () => void;
  readonly ids: IdGenerator;
  /** How the scheduler wakes itself up. */
  readonly setTimer: SetTimer;
  /** A new token for the routine state's leases. */
  readonly newToken: () => string;
  /** Hears each error the engine handles itself, such as a timer that will be retried. */
  reportError(error: unknown): void;
  /**
   * Builds the harness host on the agent host, when one runs (`openStudioHarnessHost`).
   * `decisions` gives one run's bridge approvals and its phone's decisions,
   * the engine's once it is built. Without it, a workflow with an agent in a
   * harness is refused.
   */
  openHarnessHost?(decisions: EngineDecisions): Promise<StudioHarnessHost>;
}

/** An open engine and the workspace it was built on. */
interface OpenEngine {
  readonly engine: AssembledEngine;
  readonly workspace: LoadedWorkspace;
}

/** The engine of one workspace in the page, opened on first use. */
export class EngineService {
  readonly #options: EngineServiceOptions;
  #opening: Promise<OpenEngine> | undefined;
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

  /**
   * Closes the engine, if open, and gives the workspace's lock back, as when
   * the workspace changes. Safe to call twice; a later {@link open} starts afresh.
   */
  async close(): Promise<void> {
    const opening = this.#opening;
    this.#opening = undefined;
    if (opening === undefined) return;
    const open = await opening.catch(() => undefined);
    await open?.engine.close();
  }

  /** Lets the workspace's service registry close the engine with the workspace. */
  dispose(): Promise<void> {
    this.#stopHearingTrust?.();
    return this.close();
  }

  /**
   * Closes the open engine, as {@link EngineService.close} does, when the workspace it loaded may
   * start nothing now: its runs in progress stop, and no timer of theirs, harness step included,
   * runs again in this window. A check that rejects is a no.
   */
  async #closeIfUntrusted(): Promise<void> {
    const opening = this.#opening;
    if (opening === undefined) return;
    const open = await opening.catch(() => undefined);
    if (open === undefined) return;
    const may = await this.#options.mayStart(open.workspace).catch(() => false);
    // Not when the engine was closed or opened afresh meanwhile: that one was checked as it opened.
    if (!may && this.#opening === opening) await this.close();
  }

  /**
   * Refuses an agent the page can't start: one that lists a connector, or one in a harness
   * program when no agent host runs.
   */
  #refuseWhatThePageCantStart(agent: Agent): void {
    if (startsAProgram(agent.harness) && this.#options.openHarnessHost === undefined) {
      throw unavailable(
        agent.name,
        "runs in a harness program",
        `Set ${agent.name} to Halonic on its Harness page to run it now.`,
      );
    }
    if (agent.connectors.length > 0) {
      throw unavailable(agent.name, "uses a connector", "Run this workflow from the command line.");
    }
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

  /**
   * Takes the shell's engine lock; when the shell later loses it, closes the engine, so the
   * other process's engine is the only one left on the workspace.
   *
   * @throws KindedError `conflict` naming the other process, or the lock's other refusals
   */
  async #holdLock(): Promise<TauriHeldEngineLock> {
    const { lock, reportError } = this.#options;
    try {
      return await lock.hold((lost) => {
        reportError(lost);
        this.close().catch(reportError);
      });
    } catch (refusal) {
      throw lockRefusal(refusal);
    }
  }

  async #openOnce(): Promise<OpenEngine> {
    const { ipc, location, clock, reportError } = this.#options;
    const held = await this.#holdLock();
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
            // Each harness step asks again, so trust removed where this window doesn't hear it
            // (`halonic trust revoke`) still starts no harness program (HAL-12811). The trust
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
        release: () => held.release(),
      });
      executor = engine.executor;
      return { engine, workspace };
    } catch (error) {
      await held.release();
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

/** The lock's refusal as the page says it: a `conflict` names the other process, others stay as they are. */
function lockRefusal(refusal: unknown): unknown {
  if (!(refusal instanceof KindedError) || refusal.kind !== "conflict") return refusal;
  const pid = pidOf(refusal.cause);
  const holder = pid === undefined ? "another engine" : `another engine (process ${pid})`;
  return new KindedError("conflict", `This workspace is open in ${holder}.`, {
    fix: "Close it, then try again.",
    cause: refusal,
  });
}

function pidOf(refusal: unknown): number | undefined {
  if (typeof refusal !== "object" || refusal === null) return undefined;
  const { pid } = refusal as Record<string, unknown>;
  return typeof pid === "number" ? pid : undefined;
}

function unavailable(agentName: string, why: string, fix: string): KindedError {
  return new KindedError("unavailable", `${agentName} ${why}, which this window can't start yet.`, {
    fix,
  });
}
