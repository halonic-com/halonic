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
// A run starts its `stdio` connectors on the agent host (`openRunConnectors`,
// HAL-13344), as the Library's listing does, and offers the tools approved
// there; agents in a harness run in the agent host's sandbox
// (`openHarnessHost`, HAL-10849). Where no agent host runs, a workflow with an
// agent that lists a connector or runs in a harness is refused as
// `unavailable` before the engine opens, as is one whose agent lists a
// connector that isn't `stdio` where it does. An Approve of a connector's tool call
// the window can't make (no agent host, or a run the CLI started at a commit) is
// refused the same way, with the CLI line that sends it (`engine-refusals.ts`).
// Each start reads the files as saved then (`engine-saved-files.ts`, HAL-16324). Nothing starts
// from a workspace that isn't trusted, unless it reaches only the test model, the CLI's rule
// (HAL-1984, HAL-12409): the engine checks it when it opens and before each start, and closes
// when the trust is removed while it is open (HAL-12799), ending the runs it stopped right then
// (HAL-13678). A start the shell refuses because Remove trust closed the folder is refused as
// untrusted too (`engine-trust.ts`). While it is open, it starts the workspace's routines on
// time, as `halonic routines watch` does (`pageRoutines`, HAL-14205).
// Run, the Inbox form, Run now and routines start from the live version, as the CLI's do, and
// each run's definitions, trust check and connector files come from the version it records
// (`PageRunVersions`, HAL-14229).

import { NodeCoordination } from "@halonicjs/adapter-coordination-node";
import { TauriRecordStore, TauriRunStore } from "@halonicjs/adapter-fs-tauri";
import { nodeSchedulerFactory } from "@halonicjs/adapter-scheduler-node";
import {
  routineStateCollection,
  runTimerCollection,
  type WorkflowRef,
  workspaceExecutorOptions,
} from "@halonicjs/adapter-workspace-models";
import type { startOfDueRun } from "@halonicjs/app";
import {
  type AssembledEngine,
  assembleEngine,
  type LocalExecutor,
  noListedToolApproval,
} from "@halonicjs/engine";
import type { RunSummary } from "@halonicjs/events";
import type { SendOptions, StartRunRequest } from "@halonicjs/ports";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import { openEngineHarnessHost } from "./engine-harness-host.ts";
import { holdEngineLock } from "./engine-lock.ts";
import { answerRefusalOf, refuseConnectorApprove } from "./engine-refusals.ts";
import {
  type EngineOpener,
  type OpenEngine,
  openOnSavedFiles,
  reopenOnLocalOnlySave,
  takeForRoutine,
} from "./engine-reopen.ts";
import { startRoutineOn } from "./engine-routine-start.ts";
import { pageRoutines, routineSkipsOf, SkipListeners } from "./engine-routines.ts";
import { engineRunsOptions, openRunsOf } from "./engine-runs-options.ts";
import { SavedWorkspace } from "./engine-saved-files.ts";
import type { EngineServiceOptions } from "./engine-service-options.ts";
import { refuseAgentOn, refuseRoutineWorkflowOn, refuseWorkflowOn } from "./engine-start-checks.ts";
import {
  closeAndEndStoppedRuns,
  refuseUntrusted,
  untrustedWhenFolderClosed,
} from "./engine-trust.ts";
import { withKeyOriginPrompt } from "./key-origin-prompt.ts";
import type { PageRuns } from "./page-refusal.ts";
import { PageRunVersions } from "./page-run-versions.ts";

export type { PageEngineLock } from "./engine-lock.ts";
export { trustRemovedCause } from "./engine-trust.ts";

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

export type { EngineServiceOptions, StudioRunConnectors } from "./engine-service-options.ts";

/** The engine of one workspace in the page, opened on first use. */
export class EngineService {
  readonly #options: EngineServiceOptions;
  #opening: Promise<OpenEngine> | undefined;
  /** Ending the runs an engine closed for a removed trust stopped; the next engine opens after it. */
  #ending: Promise<void> = Promise.resolve();
  readonly #stopHearingTrust: (() => void) | undefined;
  /** A routine's skip records while the engine is open (`routineSkipsOf`); none before. */
  readonly routineSkips = (key: string) =>
    routineSkipsOf(this.#opening, this.#options.location, key);
  readonly #skips = new SkipListeners();
  /** Calls `listener` each time a routine's tick adds to its skip records; returns the way to stop. */
  readonly onRoutineSkips = (listener: () => void) => this.#skips.subscribe(listener);
  /** How a start, an answer and a routine's start take the version they read (`engine-reopen.ts`). */
  readonly #opener: EngineOpener;
  /** The versions runs start from; a run's load is kept only where its connectors' end forgets it. */
  readonly #runVersions: PageRunVersions;

  constructor(options: EngineServiceOptions) {
    this.#options = options;
    this.#runVersions = new PageRunVersions({
      versions: options.versions,
      saved: options.definitions,
      keepsRuns: options.openRunConnectors !== undefined,
    });
    this.#opener = {
      current: () => this.#opening,
      open: () => this.#open(),
      close: () => this.close(),
      // The version a start reads now, which the engine's models, budget and trust read from here on.
      load: async () => (await this.#runVersions.opening()).workspace,
      name: options.name,
      reportError: options.reportError,
    };
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
   *   window's, holds the workspace's lock; `unavailable` when the lock can't be written; or
   *   `denied` when the workspace may start nothing
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
   * After a save that turned Local only on or off, opens a new engine once no run is going, so a
   * run waiting for a timer resumes with the new setting (`reopenOnLocalOnlySave`). Opens nothing
   * when no engine is open.
   */
  reopenOnLocalOnlySave(): Promise<void> {
    return reopenOnLocalOnlySave(this.#opener);
  }

  /**
   * The open engine, for a start: opens it as {@link EngineService.open} does, and refuses each
   * time it's asked when its workspace may start nothing now, such as after a person removed their
   * trust while the engine was open. Everything that starts on the engine goes through here.
   *
   * @throws KindedError `denied`, also for the shell's refusal of a folder Remove trust closed, or
   *   what {@link EngineService.open} throws
   */
  openForStart(): Promise<AssembledEngine> {
    return this.#untrustedWhenFolderClosed(async () => {
      const { engine, saved } = await openOnSavedFiles(this.#opener);
      await refuseUntrusted(this.#options.mayStart, saved.latest());
      return engine;
    });
  }

  /**
   * Runs a start, an answer or a cancel, with the shell's refusal of a folder Remove trust closed
   * said as untrusted.
   */
  #untrustedWhenFolderClosed<T>(act: () => Promise<T>): Promise<T> {
    return untrustedWhenFolderClosed(act, this.#options.isTrustedNow);
  }

  /**
   * Refuses a workflow the page can't run, before the engine opens, on the version a start reads
   * now: one with an agent that lists a connector, or an agent in a harness when no agent host
   * runs.
   *
   * @throws StartRefused naming the agent, with the next step: the Harness page, or the command
   *   that starts the run in a terminal
   * @throws RangeError when the hub or the workflow doesn't exist
   * @throws KindedError `conflict` when nothing is live yet, or `unavailable` when git can't
   *   read the live version
   */
  async check(run: WorkflowRef): Promise<void> {
    refuseWorkflowOn((await this.#runVersions.pick()).loaded.workspace, run, this.pageRuns);
  }

  /**
   * Refuses an agent a routine starts on its own that the page can't run, before the engine
   * opens, as {@link EngineService.check} refuses a workflow's agents.
   *
   * @throws WindowCantStart naming the agent, with the Harness page step for an agent in a
   *   harness
   * @throws RangeError when the hub has no such agent
   */
  async checkAgent(agent: AgentRef): Promise<void> {
    refuseAgentOn((await this.#runVersions.pick()).loaded.workspace, agent, this.pageRuns);
  }

  /**
   * Starts a run of the workflow with `input`, on the live version, or the saved files with
   * history off: refuses what the page can't run ({@link EngineService.check}), opens the engine,
   * and returns once the run has started, not when it ends. The run records a manual trigger, or
   * an `inbox` one for a request from the Inbox's form.
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
    // A run started from the window is the person's own, so it names a trigger: with none, the
    // Runs list says it was started in the terminal.
    const trigger = { type: from, at: this.#options.clock.now().toISOString() };
    return this.#untrustedWhenFolderClosed(() => this.startWorkflow(run, input, trigger));
  }

  /**
   * Starts a run of the workflow on the version a start reads now, checked as
   * {@link EngineService.check} checks it, with `trigger`: for Run, the Inbox form and Run now.
   *
   * @returns the new run's id
   * @throws what {@link EngineService.check} and {@link EngineService.open} throw, or the
   *   executor's refusal, such as of a version that isn't trusted
   */
  async startWorkflow(
    run: WorkflowRef,
    input: StartRunRequest["input"],
    trigger: NonNullable<StartRunRequest["trigger"]>,
  ): Promise<{ readonly id: string }> {
    const { version, loaded } = await this.#runVersions.pick();
    refuseWorkflowOn(loaded.workspace, run, this.pageRuns);
    const engine = await this.openForStart();
    const { id } = await engine.executor.start({ ...run, input, trigger, version });
    return { id };
  }

  /** Starts what a routine runs, for its Run now ({@link startRoutineOn}). */
  startRoutine(
    start: RoutineRunStart,
    trigger: { readonly routineKey: string; readonly at: string },
  ): Promise<{ readonly id: string }> {
    return this.#untrustedWhenFolderClosed(() => startRoutineOn(this, start, trigger));
  }

  /**
   * Sends `event` to a run waiting for a person, such as an Inbox card's Approve or Reject, as
   * `halonic runs send` does, with the executor's `payload` and `options` (the call or wait step it
   * answers): opens the engine, with the checks of a start, and returns once the event is recorded.
   * Another engine holding the workspace, or Local only changed while a run is going, fails as
   * `unavailable` with its next step in the sentence, a failure to try again, and an Approve of a
   * connector's tool call the window can't make is refused before it's recorded (`engine-refusals`).
   * @returns the run as it is after the event
   * @throws KindedError `unavailable` for those, `denied` for a workspace that may start nothing,
   *   what {@link EngineService.open} throws otherwise, or the executor's refusal
   */
  async send(
    runId: string,
    event: string,
    payload?: unknown,
    options?: SendOptions,
  ): Promise<RunSummary> {
    return this.#untrustedWhenFolderClosed(async () => {
      const { engine, saved, runs } = await this.#forAnswer();
      const { startsConnectors } = this.pageRuns;
      const workspace = saved.latest();
      await refuseConnectorApprove({ runs, workspace, startsConnectors }, runId, event, options);
      return engine.executor.send(runId, event, payload, options);
    });
  }

  /**
   * Cancels a run, as the run page's **Cancel run** asks: opens the engine with the trust check of
   * an answer ({@link EngineService.send}), then ends the run and the child runs it waits on as
   * cancelled. The run's record stays. A cancel starts nothing, so it takes no saved files and goes
   * on the open engine as it is, even after a save turned local only on or off.
   * @returns the run as it ended
   * @throws what {@link EngineService.send} throws before it sends, or the executor's refusal of a
   *   run it doesn't know
   */
  async cancel(runId: string): Promise<RunSummary> {
    return this.#untrustedWhenFolderClosed(async () => {
      const { engine } = await this.#forAnswer(() => this.#open());
      return engine.executor.cancel(runId);
    });
  }

  /**
   * The engine `open` gives, for an answer: with the checks of a start, and the lock's `conflict`
   * and a refusal to try again later as one `unavailable` sentence (`answerRefusalOf`).
   */
  async #forAnswer(open = () => openOnSavedFiles(this.#opener)): Promise<OpenEngine> {
    const opened = await open().catch((error: unknown) => {
      throw answerRefusalOf(error);
    });
    await refuseUntrusted(this.#options.mayStart, opened.saved.latest());
    return opened;
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

  /**
   * The runs the open engine hasn't ended, running or waiting, and the workspace it loaded:
   * `undefined` while no engine is open or it didn't open. Reads only; it never opens the engine.
   */
  async openRuns(): Promise<
    { readonly runs: readonly RunSummary[]; readonly workspace: LoadedWorkspace } | undefined
  > {
    const open = await this.#opening?.catch(() => undefined);
    if (open === undefined) return undefined;
    return {
      runs: await open.runs.list({ status: ["running", "waiting"] }),
      workspace: open.workspace,
    };
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
    const may = await this.#options.mayStart(open.saved.latest()).catch(() => false);
    // Not when the engine was closed or opened afresh meanwhile: that one was checked as it opened.
    if (may || this.#opening !== opening) return;
    this.#opening = undefined;
    this.#ending = closeAndEndStoppedRuns(open.engine, open.lock, this.#options);
    await this.#ending;
  }

  /**
   * What the page can start: an agent in a harness program where an agent host runs, and a run's
   * `stdio` connectors where the agent host starts them.
   */
  get pageRuns(): PageRuns {
    return {
      runsHarnesses: this.#options.openHarnessHost !== undefined,
      startsConnectors: this.#options.openRunConnectors !== undefined,
    };
  }

  async #openOnce(): Promise<OpenEngine> {
    const { ipc, location, name, clock, reportError } = this.#options;
    // After the runs a removed trust stopped are ended, whose closer gives the lock back then.
    await this.#ending.catch(() => undefined);
    // When the shell later loses the lock, the engine closes, so the other process's engine is
    // the only one left on the workspace.
    const lock = await holdEngineLock(this.#options.lock, name, (lost, kind) => {
      reportError(lost);
      this.close().catch(reportError);
      this.#options.onLockLost?.(kind);
    });
    try {
      const { workspace } = await this.#runVersions.opening();
      // Before the scheduler and the harness host start, so an untrusted workspace's
      // routines don't fire and its open harness runs don't resume either.
      await refuseUntrusted(this.#options.mayStart, workspace);
      const saved = new SavedWorkspace(workspace);
      const { latest } = saved;
      const runConnectors = await this.#options.openRunConnectors?.(this.#runVersions);
      const connectors = runConnectors?.connectors;
      const runStore = new TauriRunStore(ipc, location);
      // Set once the engine is built; a bridge opens only during a run, so after that.
      let executor: LocalExecutor | undefined;
      const harnessHost = await openEngineHarnessHost(this.#options, latest, {
        approvalsOf: (runId, attemptId) => executor?.bridgeApprovals(runId, attemptId),
        remoteDecisionsOf: (runId) => executor?.bridgeRemoteDecisions(runId),
        runVersions: this.#runVersions,
      });
      await harnessHost?.start(await openRunsOf(runStore));
      const onSkipsSaved = () => this.#skips.tell();
      const routineOptions = { ...this.#options, onSkipsSaved };
      const routines = pageRoutines(workspace, routineOptions, async (request) => {
        // On the version the routine's run records. A routine's step keeps it starting on time,
        // where Run's `halonic run` starts it once.
        const atVersion = await this.#runVersions.workspaceAt(request.version);
        refuseRoutineWorkflowOn(atVersion, request, this.pageRuns);
        await takeForRoutine(this.#opener, saved, executor, runStore);
        await refuseUntrusted(this.#options.mayStart, atVersion);
      });
      const fromWorkspace = workspaceExecutorOptions({
        workspace,
        latest,
        secrets: this.#options.secrets,
        http: this.#options.http,
        clock,
        isTrusted: () => this.#options.isTrusted(latest()),
        keyOrigins: this.#options.keyOrigins,
        // The approvals given in the Library, read at the start of every turn. Without an
        // agent host no connector starts, so no listed tool is offered.
        listedToolApproval: runConnectors?.listedToolApproval ?? noListedToolApproval,
      });
      const engine = assembleEngine({
        createScheduler: nodeSchedulerFactory({
          store: new TauriRecordStore(ipc, location),
          collection: runTimerCollection,
          clock,
          setTimer: this.#options.setTimer,
          reportError,
        }),
        executor: {
          // "Allow this address?" (HAL-11873), only with the window's prompt.
          ...withKeyOriginPrompt(fromWorkspace, { ...this.#options, runs: runStore }),
          runs: engineRunsOptions(this.#options, {
            runStore,
            latest,
            runVersions: this.#runVersions,
            connectors,
            harnessHost,
          }),
        },
        coordination: new NodeCoordination({
          store: new TauriRecordStore(ipc, location),
          collection: routineStateCollection,
          clock,
          newToken: this.#options.newToken,
        }),
        // After the executor and the scheduler, so no step calls a connector that has closed.
        closers: connectors === undefined ? [] : [() => connectors.closeAll()],
        routines: routines.ticks,
        // Last, so no other engine starts while this one still delivers a timer.
        release: async () => {
          if (!lock.kept) await lock.held.release();
        },
      });
      executor = engine.executor;
      // Straight away, as `routines watch` does, so the times missed while no engine ran start now.
      routines.catchUp().catch(reportError);
      return { engine, workspace, saved, lock, runs: runStore };
    } catch (error) {
      await lock.held.release();
      throw error;
    }
  }
}
