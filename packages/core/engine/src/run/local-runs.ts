// The run side of the local executor: it records each input with `step`,
// then carries out the effects through the scheduler, so a run moves on one
// step per timer, and a timer that is late or repeated changes nothing.

import type { RunEvent, RunSummary } from "@halonicjs/events";
import type {
  Clock,
  RunEventListener,
  RunStore,
  RunSubscription,
  ScheduledTimer,
  SendOptions,
  StartRunRequest,
} from "@halonicjs/ports";
import type { WaitedOnCall } from "../harness/serial-run-log.ts";
import { checkStartTimeouts } from "../harness/start-limits.ts";
import type { AnswerHarnessEffect, DecideInput, Effect } from "../kernel/decide-types.ts";
import { InputRefused } from "../kernel/input-refused.ts";
import { callOf, hasEnded, type PendingCall, type RunState } from "../kernel/run-state.ts";
import { readRun, step } from "../kernel/step.ts";
import { childNow, parentEnded, receiverOf } from "./child-runs.ts";
import { failedCallInput } from "./failed-call-input.ts";
import { LocalHarnessCalls } from "./local-harness-calls.ts";
import { type CallModel, LocalModelCalls } from "./local-model-calls.ts";
import {
  builtEffectsOf,
  type LocalRunLimits,
  type LocalRunsOptions,
  runLimitsOf,
  unbuiltEffectFailure,
} from "./local-runs-options.ts";
import { RunsProposalFolders } from "./proposal-folders.ts";
import { type RecordStartPorts, recordStart } from "./record-start.ts";
import {
  type CallTool,
  noConnectorCalls,
  RunConnectorCallRunner,
} from "./run-connector-call-runner.ts";
import type { RunsConnectors } from "./run-connectors.ts";
import { RunEnds } from "./run-ends.ts";
import { cancelledError, harnessGoneError } from "./run-errors.ts";
import { RunFeed } from "./run-feed.ts";
import { RunRules } from "./run-rules.ts";
import {
  callTimer,
  childTimer,
  harnessTimer,
  ruleTimer,
  stateTimer,
  toolTimer,
} from "./run-timer-ids.ts";
import { sendNames } from "./send-names.ts";
import { type ChildStartPorts, startChild } from "./start-child.ts";
import { StartDeadlines } from "./start-deadlines.ts";
import { checkStartRequest } from "./start-request.ts";
import { sweepLostRuns } from "./sweep-lost-runs.ts";
import { UnfinishedEffects } from "./unfinished-effects.ts";
import { UnrecordedResults } from "./unrecorded-results.ts";
import { WatchedRuns } from "./watched-runs.ts";

/** How a call a run waits on is carried out: a model call, or a run of the agent's harness. */
type CallKind = "model" | "harness";

/** Runs workflows in this process for the local executor. */
export class LocalRuns {
  /** The runs' store: every append through it that lands tells the subscribers, whoever makes it. */
  readonly store: RunStore;
  readonly #options: LocalRunsOptions;
  readonly #clock: Clock;
  readonly #connectorCalls: RunConnectorCallRunner;
  readonly #rules: RunRules;
  readonly #feed: RunFeed;
  readonly #startDeadlines: StartDeadlines;
  readonly #builtEffects: ReadonlySet<Effect["type"]>;
  readonly #limits: LocalRunLimits;
  /** The calls being carried out now, so a timer delivered twice makes one call. */
  readonly #calling = new Set<string>();
  readonly #unrecorded = new UnrecordedResults();
  readonly #effects: UnfinishedEffects;
  readonly #harnessCalls: LocalHarnessCalls;
  readonly #modelCalls: LocalModelCalls;
  readonly #folders: RunsProposalFolders;
  readonly #connectors: Pick<RunsConnectors, "ended" | "notStarted"> | undefined;
  readonly #ends: RunEnds;
  #started: Promise<number> | undefined;
  /** Set by {@link LocalRuns.close}: timers change nothing and calls record nothing from then on. */
  #closed = false;

  /**
   * @param connectors - the connectors of the runs, which a top-level run's end ends
   * @throws RangeError when a start limit in `harnesses` isn't a whole number of milliseconds of 1 or more
   */
  constructor(
    options: LocalRunsOptions,
    clock: Clock,
    callModel: CallModel,
    callTool: CallTool = noConnectorCalls,
    connectors?: Pick<RunsConnectors, "ended" | "notStarted">,
  ) {
    checkStartTimeouts(options.harnesses?.startTimeoutsMs);
    this.#options = options;
    this.#clock = clock;
    this.#modelCalls = new LocalModelCalls(options.store, callModel);
    this.#feed = new RunFeed(options.store);
    this.store = new WatchedRuns(options.store, (runId) => this.#feed.notify(runId));
    this.#startDeadlines = new StartDeadlines(options.scheduler, clock);
    this.#folders = new RunsProposalFolders(this.store, options.proposalFolders);
    this.#connectors = connectors;
    this.#builtEffects = builtEffectsOf(options);
    this.#limits = runLimitsOf(options);
    this.#harnessCalls = new LocalHarnessCalls({
      store: this.store,
      blobs: options.blobs,
      harnesses: options.harnesses,
      folders: this.#folders,
      startDeadlines: this.#startDeadlines,
      clock,
      ...(this.#limits.budget === undefined ? {} : { budget: this.#limits.budget }),
      ...(options.mayStartHarness === undefined
        ? {}
        : { mayStart: options.mayStartHarness.bind(options) }),
      record: (runId, input) => this.#record(runId, input),
      send: (runId, event, options) => this.send(runId, event, undefined, options),
    });
    this.#ends = new RunEnds({
      store: this.store,
      folders: this.#folders,
      modelCalls: this.#modelCalls,
      harnessCalls: this.#harnessCalls,
      connectors,
      meter: this.#limits.meter,
      tellParentOf: (runId) => this.#tellParentOf(runId),
      now: () => this.#now(),
    });
    this.#effects = new UnfinishedEffects({
      store: this.store,
      scheduler: options.scheduler,
      carryOut: (run, effect) => this.#carryOut(run, effect),
      ended: (runId) => this.#ends.ended(runId),
      now: () => this.#now(),
    });
    this.#connectorCalls = new RunConnectorCallRunner({
      store: this.store,
      deadlines: this.#startDeadlines,
      callTool,
      record: (runId, input) => this.#recordIfTaken(runId, input),
      now: () => this.#now(),
      isClosed: () => this.#closed,
    });
    this.#rules = new RunRules({
      store: this.store,
      blobs: options.blobs,
      isolate: options.toolScriptIsolate,
      record: (runId, input) => this.#recordIfTaken(runId, input),
      now: () => this.#now(),
      isClosed: () => this.#closed,
    });
  }

  /**
   * Records the start of a run and sets the timer for its first effects. A
   * `runId` that already exists returns that run and starts nothing. A run
   * that can write files gets its proposal folder first.
   *
   * @throws RangeError when `runId` is longer than 256 UTF-8 bytes, or `harness` isn't a harness
   * @throws when the hub or workflow doesn't exist, or the proposal folder can't be opened
   */
  async start(request: StartRunRequest): Promise<RunSummary> {
    checkStartRequest(request);
    await this.ready();
    const runId = request.runId ?? this.#options.ids.next("run");
    const existing = await this.store.get(runId);
    if (existing !== null) return existing;
    const { hubId, workflowId, version } = request;
    const definitions = await this.#options.definitionsOf(hubId, workflowId, version, runId);
    try {
      await recordStart(this.#startPorts(), request, runId, definitions);
      return await this.#summary(runId);
    } catch (error) {
      // The host kept something for the run when it read its definitions: with no start recorded, nothing ends it.
      if ((await this.store.get(runId)) === null) await this.#connectors?.notStarted(runId);
      throw error;
    }
  }

  /**
   * Records an event sent to a run, and sets the timer for what it causes.
   * While the run waits on a child run that waits, the event goes to that
   * child, unchanged, and the run hears from the child once it is recorded.
   *
   * @throws InputRefused when the run doesn't exist or doesn't take the event now
   */
  async send(
    runId: string,
    event: string,
    payload?: unknown,
    options?: SendOptions,
  ): Promise<RunSummary> {
    await this.ready();
    await this.#record(await receiverOf(this.store, runId), {
      type: "send",
      at: this.#now(),
      event,
      ...(payload === undefined ? {} : { payload }),
      ...sendNames(options),
    });
    return this.#summary(runId);
  }

  /**
   * Cancels a run that hasn't ended, and its child runs, all the
   * way down: each ends with `run.failed` and `reason: "cancelled"`, the run
   * first, so it doesn't take its child's end for its own failure. Their
   * harness and model calls are stopped; a connector call going on finishes,
   * and the run takes its result no more. A run that has ended stays as it is.
   *
   * @throws InputRefused when the run doesn't exist
   */
  async cancel(runId: string): Promise<RunSummary> {
    await this.ready();
    if ((await this.store.get(runId)) === null)
      throw new InputRefused("engine.run-unknown", `There's no run "${runId}".`);
    await this.#ends.cancelDown(runId, { error: cancelledError });
    return this.#summary(runId);
  }

  subscribe(runId: string, afterSeq: number, listener: RunEventListener): RunSubscription {
    return this.#feed.subscribe(runId, afterSeq, listener, this.ready());
  }

  /**
   * A timer of a run is due: carry out the call it names, end a harness
   * start whose time is up, or pass the run the timer a state set; any
   * other first carries out the effects the run kept. A late, repeated,
   * unwanted or post-{@link LocalRuns.close} timer changes nothing.
   */
  async onTimer(timer: ScheduledTimer): Promise<void> {
    if (this.#closed) return;
    await this.ready();
    if (StartDeadlines.owns(timer)) return this.#startDeadlines.expire(timer);
    await this.#effects.resume(timer.key);
    if (timer.timerId.startsWith(callTimer)) {
      await this.#carryOutCall(timer.key, timer.timerId.slice(callTimer.length), "model");
    } else if (timer.timerId.startsWith(harnessTimer)) {
      await this.#carryOutCall(timer.key, timer.timerId.slice(harnessTimer.length), "harness");
    } else if (timer.timerId.startsWith(stateTimer)) {
      const key = timer.timerId.slice(stateTimer.length);
      await this.#recordIfTaken(timer.key, { type: "timer", at: this.#now(), key });
    } else if (timer.timerId.startsWith(childTimer)) {
      await this.#hearFromChild(timer.key, timer.timerId.slice(childTimer.length));
    } else if (timer.timerId.startsWith(toolTimer)) {
      await this.#connectorCalls.make(timer.key, timer.timerId.slice(toolTimer.length));
    } else if (timer.timerId.startsWith(ruleTimer)) {
      await this.#rules.run(timer.key, timer.timerId.slice(ruleTimer.length));
    }
  }

  /** The approvals of one run's bridge ({@link LocalHarnessCalls.bridgeApprovals}). */
  bridgeApprovals(runId: string) {
    return this.#harnessCalls.bridgeApprovals(runId);
  }

  /** The remote decisions on one run's bridge ({@link LocalHarnessCalls.bridgeRemoteDecisions}). */
  bridgeRemoteDecisions(runId: string) {
    return this.#harnessCalls.bridgeRemoteDecisions(runId);
  }

  /**
   * Stops running runs in this process: every harness run going on is
   * stopped, with its session and bridge, and this resolves once they all
   * have. What they were doing isn't recorded, so their runs stay `running`
   * in the log and end as `interrupted` when an engine next starts on the
   * store: a harness run can't be resumed.
   */
  async close(): Promise<void> {
    this.#closed = true;
    await Promise.all([this.#harnessCalls.stopAll(), this.#modelCalls.stopAll()]);
  }

  /**
   * Before the first run starts or resumes, end the runs the engine lost when it last stopped
   * (a failure is tried again on the next call). Resolves to how many ended as `interrupted`;
   * to 0, with the store untouched, when the options turn `sweepsLostRuns` off.
   */
  ready(): Promise<number> {
    this.#started ??= this.#endInterruptedRuns().catch((error: unknown) => {
      this.#started = undefined;
      throw error;
    });
    return this.#started;
  }

  /**
   * Their parents hear from them on a `child:` timer, not in this call: a
   * failure to tell one would otherwise be lost, because a retry no longer
   * finds the runs it ended. Their folders end last for the same reason: a
   * folder adapter that throws must not keep a parent from hearing.
   */
  async #endInterruptedRuns(): Promise<number> {
    if (this.#options.sweepsLostRuns === false) return 0;
    await this.#connectorCalls.markCutShort();
    return sweepLostRuns(this.store, this.#clock, this.#options.scheduler, (runId) =>
      this.#ends.ended(runId),
    );
  }

  async #carryOutCall(runId: string, callId: string, kind: CallKind): Promise<void> {
    // Claim the slot before the read: a delivery whose read ends after the
    // first call is recorded and the slot freed would still see the call.
    const slot = JSON.stringify([runId, callId]);
    if (this.#calling.has(slot)) return;
    this.#calling.add(slot);
    const record = (input: DecideInput) => this.#recordIfTaken(runId, input);
    try {
      if (await this.#unrecorded.recordKept(slot, record)) return;
      const run = await readRun(this.store, runId);
      const call = run == null ? null : callOf(run, callId);
      if (run == null || call === null) return;
      const result = await this.#callResult(run, call, kind);
      // A stopped call isn't the run's failure: whoever stopped it has ended the run.
      if (this.#closed || result === null) return;
      await this.#unrecorded.record(slot, result, record);
    } finally {
      this.#calling.delete(slot);
    }
  }

  /**
   * The input a call gives: its answer, or why it failed. A harness call
   * that a person answered gives it under the call id the run then waits on.
   * A model call that was stopped gives `null`: there is nothing to record.
   */
  async #callResult(run: RunState, call: PendingCall, kind: CallKind): Promise<DecideInput | null> {
    const waitedOn: WaitedOnCall = { callId: call.callId };
    try {
      const result =
        kind === "model"
          ? await this.#modelCalls.run(run, call)
          : { type: "harness" as const, output: await this.#harnessCalls.run(run, call, waitedOn) };
      if (result === null) return null;
      return { type: "effect-done", at: this.#now(), callId: waitedOn.callId, result };
    } catch (error) {
      return failedCallInput(error, { callId: waitedOn.callId, at: this.#now(), step: call.state });
    }
  }

  /**
   * Hands a person's answer to the harness call that asked, which still
   * runs. When no call of this engine waits for it, as after a restart, the
   * run ends as interrupted: the harness's program is gone and can't go on,
   * and the agent never falls back to a model call.
   */
  async #answerHarness(runId: string, effect: AnswerHarnessEffect): Promise<void> {
    if (this.#harnessCalls.answer(runId, effect)) return;
    await this.#recordIfTaken(runId, {
      type: "effect-failed",
      at: this.#now(),
      callId: effect.callId,
      error: harnessGoneError,
      reason: "interrupted",
    });
  }

  /** As {@link LocalRuns.#record}, but an input the run no longer takes changes nothing. */
  async #recordIfTaken(runId: string, input: DecideInput): Promise<void> {
    try {
      await this.#record(runId, input);
    } catch (error) {
      if (!(error instanceof InputRefused)) throw error;
    }
  }

  /**
   * Steps the run with the input (the store tells the subscribers), and carries out
   * or schedules the effects; those it can't are kept for the run's next timer.
   *
   * @returns the events the step stored; none when the input changed nothing
   */
  async #record(runId: string, input: DecideInput): Promise<readonly RunEvent[]> {
    const { blobs } = this.#options;
    const ports = { runs: this.store, blobs, ...this.#limits };
    const { run, events, effects } = await step(ports, runId, input);
    const unbuilt = unbuiltEffectFailure(effects, this.#builtEffects);
    if (unbuilt !== undefined) {
      // The events are stored, so throwing would leave the run going with no
      // timer to move it on. Until the agent loop (4a) carries these out,
      // the run fails and none of its effects are scheduled.
      await this.#ends.fail(runId, unbuilt.failure, unbuilt.reason);
      await this.#ends.ended(runId);
      return events;
    }
    await this.#effects.carryOut(run, effects);
    if (events.length === 0 || !hasEnded(run.status)) return events;
    await this.#ends.ended(runId);
    return events;
  }

  /**
   * Model calls, rules and state timers wait for their timer. A harness call that
   * waits for an answer gets it at once. A child run starts at once, and a
   * parent hears from its child at once, so it goes on in the same call;
   * its timer is set first and kept only if that fails.
   */
  async #carryOut(run: RunState, effect: Effect): Promise<void> {
    const scheduler = this.#options.scheduler;
    if (effect.type === "call-model") {
      await scheduler.schedule(run.runId, `${callTimer}${effect.callId}`, this.#now());
    } else if (effect.type === "run-harness") {
      await scheduler.schedule(run.runId, `${harnessTimer}${effect.callId}`, this.#now());
    } else if (effect.type === "call-tool") {
      await scheduler.schedule(run.runId, `${toolTimer}${effect.callId}`, this.#now());
    } else if (effect.type === "run-rule") {
      await scheduler.schedule(run.runId, `${ruleTimer}${effect.callId}`, this.#now());
    } else if (effect.type === "answer-harness") {
      await this.#answerHarness(run.runId, effect);
    } else if (effect.type === "set-timer") {
      await scheduler.schedule(run.runId, `${stateTimer}${effect.key}`, effect.at);
    } else if (effect.type === "start-child") {
      await startChild(this.#childStartPorts(), run, effect);
    } else if (effect.type === "tell-parent") {
      const timerId = `${childTimer}${effect.childRunId}`;
      await scheduler.schedule(effect.parentRunId, timerId, this.#now());
      await this.#hearFromChild(effect.parentRunId, effect.childRunId);
      await scheduler.cancel(effect.parentRunId, timerId);
    } else if (effect.type === "cancel-child") {
      // Only a run that is about to fail cancels its child: nobody cancelled the child.
      await this.#ends.cancelDown(effect.childRunId, parentEnded);
    }
  }

  /** Gives the parent a `child` input with how its child is now. */
  async #hearFromChild(parentRunId: string, childRunId: string): Promise<void> {
    const now = await childNow(this.store, childRunId);
    if (now === null) return;
    await this.#recordIfTaken(parentRunId, { type: "child", at: this.#now(), childRunId, ...now });
  }

  /** Tells a run's parent, if it has one, how the run is now. */
  async #tellParentOf(runId: string): Promise<void> {
    const parent = (await readRun(this.store, runId))?.parent;
    if (parent != null) await this.#hearFromChild(parent.runId, runId);
  }

  #startPorts(): RecordStartPorts {
    return {
      blobs: this.#options.blobs,
      store: this.store,
      folders: this.#folders,
      record: (runId, input) => this.#record(runId, input),
      now: () => this.#now(),
      mayStart: (runId) => this.#limits.meter.mayStart(runId),
    };
  }

  #childStartPorts(): ChildStartPorts {
    return {
      ...this.#startPorts(),
      recordIfTaken: (runId, input) => this.#recordIfTaken(runId, input),
    };
  }

  async #summary(runId: string): Promise<RunSummary> {
    const summary = await this.store.get(runId);
    if (summary === null) throw new Error(`Run "${runId}" has no log after it was recorded.`);
    return summary;
  }

  #now(): string {
    return this.#clock.now().toISOString();
  }
}
