// The run side of the local executor: it records each input with `step`,
// then carries out the effects through the scheduler, so a run moves on one
// step per timer, and a timer that is late or repeated changes nothing.

import type { RunEvent, RunFailureReason, RunSummary } from "@halonicjs/events";
import { AGENT_HARNESSES } from "@halonicjs/format";
import type {
  Clock,
  RunEventListener,
  RunSubscription,
  ScheduledTimer,
  SendOptions,
  StartRunRequest,
} from "@halonicjs/ports";
import { encodeUtf8 } from "@halonicjs/std";
import type { BudgetCheck } from "../budget/keep-to-budget.ts";
import type { WaitedOnCall } from "../harness/serial-run-log.ts";
import { checkStartTimeouts } from "../harness/start-limits.ts";
import type {
  AnswerHarnessEffect,
  DecideInput,
  Effect,
  ModelCallResult,
  StartChildEffect,
} from "../kernel/decide-types.ts";
import { InputRefused } from "../kernel/input-refused.ts";
import { keepDefinitions } from "../kernel/kept-definitions.ts";
import { callOf, hasEnded, type PendingCall, type RunState } from "../kernel/run-state.ts";
import { readRun, step } from "../kernel/step.ts";
import { appendFailed } from "./append-failed.ts";
import { childNow, childStart, endChildrenOf, parentEndedError, receiverOf } from "./child-runs.ts";
import { endInterruptedRuns } from "./end-interrupted-runs.ts";
import { failedCallInput } from "./failed-call-input.ts";
import { LocalHarnessCalls } from "./local-harness-calls.ts";
import { budgetCheckOf, builtEffectsOf, type LocalRunsOptions } from "./local-runs-options.ts";
import { RunsProposalFolders } from "./proposal-folders.ts";
import {
  type CallTool,
  noConnectorCalls,
  RunConnectorCallRunner,
} from "./run-connector-call-runner.ts";
import { RunFeed } from "./run-feed.ts";
import { StartDeadlines } from "./start-deadlines.ts";
import { checkStartRequest, startInputOf } from "./start-request.ts";
import { resumeTimer, UnfinishedEffects } from "./unfinished-effects.ts";
import { UnrecordedResults } from "./unrecorded-results.ts";

/**
 * Carries out a model call a run waits on, and gives the model's answer, or
 * the tool call the agent stopped at because it needs a person's OK.
 */
export type CallModel = (run: RunState, call: PendingCall) => Promise<ModelCallResult>;

/**
 * The `error` of a run whose harness call was gone when a person answered
 * the approval it asked for: the engine stopped while the run waited.
 */
export const harnessGoneError =
  "The engine stopped while the harness waited for an answer, so the harness can't go on.";

/** The `error` of a run someone cancelled; screens word the reason themselves. */
export const cancelledError = "The run was cancelled.";

/**
 * Timer ids: a model call or a harness run to carry out now, a timer a
 * state set (`set-timer`), and a child run to hear from (on the parent's
 * key). A harness call's start limits have their own (see {@link StartDeadlines}),
 * and so does a run whose effects couldn't all be carried out ({@link resumeTimer}).
 */
const callTimer = "call:";
const harnessTimer = "harness:";
const stateTimer = "timer:";
const childTimer = "child:";
const toolTimer = "tool:";

/** How a call a run waits on is carried out: a model call, or a run of the agent's harness. */
type CallKind = "model" | "harness";

/** Runs workflows in this process for the local executor. */
export class LocalRuns {
  readonly #options: LocalRunsOptions;
  readonly #clock: Clock;
  readonly #callModel: CallModel;
  readonly #connectorCalls: RunConnectorCallRunner;
  readonly #feed: RunFeed;
  readonly #startDeadlines: StartDeadlines;
  readonly #builtEffects: ReadonlySet<Effect["type"]>;
  readonly #budget: BudgetCheck | undefined;
  /** The calls being carried out now, so a timer delivered twice makes one call. */
  readonly #calling = new Set<string>();
  readonly #unrecorded = new UnrecordedResults();
  readonly #effects: UnfinishedEffects;
  readonly #harnessCalls: LocalHarnessCalls;
  readonly #folders: RunsProposalFolders;
  #started: Promise<void> | undefined;
  /** Set by {@link LocalRuns.close}: timers change nothing and calls record nothing from then on. */
  #closed = false;

  /** @throws RangeError when a start limit in `harnesses` isn't a whole number of milliseconds of 1 or more */
  constructor(
    options: LocalRunsOptions,
    clock: Clock,
    callModel: CallModel,
    callTool: CallTool = noConnectorCalls,
  ) {
    checkStartTimeouts(options.harnesses?.startTimeoutsMs);
    this.#options = options;
    this.#clock = clock;
    this.#callModel = callModel;
    this.#feed = new RunFeed(options.store);
    this.#startDeadlines = new StartDeadlines(options.scheduler, clock);
    this.#folders = new RunsProposalFolders(options.store, options.proposalFolders);
    this.#builtEffects = builtEffectsOf(options);
    this.#budget = budgetCheckOf(options);
    this.#harnessCalls = new LocalHarnessCalls({
      store: options.store,
      blobs: options.blobs,
      harnesses: options.harnesses,
      folders: this.#folders,
      startDeadlines: this.#startDeadlines,
      clock,
      ...(this.#budget === undefined ? {} : { budget: this.#budget }),
      record: (runId, input) => this.#record(runId, input),
    });
    this.#effects = new UnfinishedEffects({
      store: options.store,
      scheduler: options.scheduler,
      carryOut: (run, effect) => this.#carryOut(run, effect),
      ended: (runId) => this.#ended(runId),
      now: () => this.#now(),
    });
    this.#connectorCalls = new RunConnectorCallRunner({
      store: options.store,
      deadlines: this.#startDeadlines,
      callTool,
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
    await this.#ready();
    const runId = request.runId ?? this.#options.ids.next("run");
    const existing = await this.#options.store.get(runId);
    if (existing !== null) return existing;
    const { hubId, workflowId, harness } = request;
    const definitions = await this.#options.definitionsOf(hubId, workflowId);
    const definitionsVersion = await keepDefinitions(this.#options.blobs, definitions);
    const opened = await this.#folders.open({ runId, hubId, workflowId }, definitions, harness);
    try {
      await this.#record(runId, startInputOf(request, runId, definitionsVersion, this.#now()));
    } catch (error) {
      // A start repeated at the same moment: the other one recorded it.
      if (error instanceof InputRefused && error.code === "engine.run-exists") {
        return this.#summary(runId);
      }
      if (opened && (await this.#options.store.get(runId)) === null) {
        await this.#folders.notStarted(runId);
      }
      throw error;
    }
    return this.#summary(runId);
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
    await this.#ready();
    await this.#record(await receiverOf(this.#options.store, runId), {
      type: "send",
      at: this.#now(),
      event,
      ...(payload === undefined ? {} : { payload }),
      ...(options?.callId === undefined ? {} : { callId: options.callId }),
    });
    return this.#summary(runId);
  }

  /**
   * Cancels a run that hasn't ended, and its child runs, all the way down:
   * each ends with `run.failed` and `reason: "cancelled"`, the run first, so
   * it doesn't take its child's end for its own failure. Their harness calls
   * are stopped; a model or connector call going on finishes, and the run
   * takes its result no more. A run that has ended stays as it is.
   *
   * @throws InputRefused when the run doesn't exist
   */
  async cancel(runId: string): Promise<RunSummary> {
    await this.#ready();
    if ((await this.#options.store.get(runId)) === null)
      throw new InputRefused("engine.run-unknown", `There's no run "${runId}".`);
    await this.#cancelDown(runId);
    return this.#summary(runId);
  }

  /** Ends the run as cancelled and, as for any run that ends, its child runs still going. */
  async #cancelDown(runId: string): Promise<void> {
    await this.#cancelOne(runId, cancelledError);
    await this.#ended(runId, cancelledError);
  }

  subscribe(runId: string, afterSeq: number, listener: RunEventListener): RunSubscription {
    return this.#feed.subscribe(runId, afterSeq, listener, this.#ready());
  }

  /**
   * A timer of a run is due: carry out the call it names, end a harness
   * start whose time is up, or pass the run the timer a state set. Any
   * other timer of a run first carries out the effects it kept. A timer
   * that is late, repeated or no longer wanted changes nothing, so this
   * resolves for it, and so does every timer after {@link LocalRuns.close}.
   */
  async onTimer(timer: ScheduledTimer): Promise<void> {
    if (this.#closed) return;
    await this.#ready();
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
    }
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
    await this.#harnessCalls.stopAll();
  }

  /**
   * Before the first run starts or resumes, end the runs the engine lost
   * when it last stopped. A failure is tried again on the next call.
   */
  #ready(): Promise<void> {
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
  async #endInterruptedRuns(): Promise<void> {
    await this.#connectorCalls.markCutShort();
    const ended = await endInterruptedRuns(this.#options.store, this.#clock);
    for (const runId of ended) this.#feed.notify(runId);
    for (const runId of ended) {
      const parent = (await readRun(this.#options.store, runId))?.parent;
      if (parent == null) continue;
      await this.#options.scheduler.schedule(parent.runId, `${childTimer}${runId}`, this.#now());
    }
    for (const runId of ended) await this.#ended(runId);
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
      const run = await readRun(this.#options.store, runId);
      const call = run == null ? null : callOf(run, callId);
      if (run == null || call === null) return;
      const result = await this.#callResult(run, call, kind);
      if (this.#closed) return;
      await this.#unrecorded.record(slot, result, record);
    } finally {
      this.#calling.delete(slot);
    }
  }

  /**
   * The input a call gives: its answer, or why it failed. A harness call
   * that a person answered gives it under the call id the run then waits on.
   */
  async #callResult(run: RunState, call: PendingCall, kind: CallKind): Promise<DecideInput> {
    const waitedOn: WaitedOnCall = { callId: call.callId };
    try {
      const result =
        kind === "model"
          ? await this.#callModel(run, call)
          : { type: "harness" as const, output: await this.#harnessCalls.run(run, call, waitedOn) };
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
   * Steps the run with the input, tells the subscribers, and carries out or
   * schedules the effects; those it can't are kept for the run's next timer.
   *
   * @returns the events the step stored; none when the input changed nothing
   */
  async #record(runId: string, input: DecideInput): Promise<readonly RunEvent[]> {
    const { store, blobs } = this.#options;
    const ports = {
      runs: store,
      blobs,
      ...(this.#budget === undefined ? {} : { budget: this.#budget }),
    };
    const { run, events, effects } = await step(ports, runId, input);
    if (events.length > 0) this.#feed.notify(runId);
    const unbuilt = effects.find((effect) => !this.#builtEffects.has(effect.type));
    if (unbuilt !== undefined) {
      // The events are stored, so throwing would leave the run going with no
      // timer to move it on. Until the agent loop (4a) carries these out,
      // the run fails and none of its effects are scheduled.
      const reason = unbuilt.type === "run-harness" ? "harness-unavailable" : "error";
      await this.#fail(
        runId,
        `The local executor can't carry out a ${unbuilt.type} effect yet.`,
        reason,
      );
      await this.#ended(runId);
      return events;
    }
    await this.#effects.carryOut(run, effects);
    if (events.length > 0 && hasEnded(run.status)) await this.#ended(runId);
    return events;
  }

  /**
   * A run has just ended: the child runs it started that are still going are
   * cancelled with `childError`, all the way down. Then, when it is a
   * top-level run, its harness calls and its child runs' stop, and its
   * proposal folder ends. It waits on those calls, so no input recorded
   * inside a harness call may end its run or any run above it (today that
   * is only `harness-asked`, which never does).
   */
  async #ended(runId: string, childError = parentEndedError): Promise<void> {
    const end = (childRunId: string) => this.#cancelOne(childRunId, childError);
    await endChildrenOf(this.#options.store, runId, end);
    await this.#folders.ended(runId, (topLevelRunId) =>
      this.#harnessCalls.stopUnder(topLevelRunId),
    );
  }

  /**
   * Model calls and state timers wait for their timer. A harness call that
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
    } else if (effect.type === "answer-harness") {
      await this.#answerHarness(run.runId, effect);
    } else if (effect.type === "set-timer") {
      await scheduler.schedule(run.runId, `${stateTimer}${effect.key}`, effect.at);
    } else if (effect.type === "start-child") {
      await this.#startChild(run, effect);
    } else if (effect.type === "tell-parent") {
      const timerId = `${childTimer}${effect.childRunId}`;
      await scheduler.schedule(effect.parentRunId, timerId, this.#now());
      await this.#hearFromChild(effect.parentRunId, effect.childRunId);
      await scheduler.cancel(effect.parentRunId, timerId);
    } else if (effect.type === "cancel-child") {
      await this.#cancelDown(effect.childRunId);
    }
  }

  /**
   * Starts a child run; one that can't start fails its parent with the
   * reason. An error after the child's start is recorded goes to the caller.
   * A parent that ended while its earlier children started, as when one of
   * them waits in a `foreach` state, starts none: no one would end it.
   */
  async #startChild(parent: RunState, effect: StartChildEffect): Promise<void> {
    const parentNow = await this.#options.store.get(parent.runId);
    if (parentNow !== null && hasEnded(parentNow.status)) return;
    try {
      const start = await childStart(this.#options.blobs, parent, effect, this.#now());
      await this.#record(effect.childRunId, start);
    } catch (error) {
      // The child was already started, by a start asked for twice.
      if (error instanceof InputRefused && error.code === "engine.run-exists") return;
      // A child whose start is recorded runs: the error came after its start.
      if ((await this.#options.store.get(effect.childRunId)) !== null) throw error;
      const message = error instanceof Error ? error.message : String(error);
      await this.#recordIfTaken(parent.runId, {
        type: "child",
        at: this.#now(),
        childRunId: effect.childRunId,
        status: "failed",
        error: `The child run couldn't start: ${message}`,
      });
    }
  }

  /** Gives the parent a `child` input with how its child is now. */
  async #hearFromChild(parentRunId: string, childRunId: string): Promise<void> {
    const now = await childNow(this.#options.store, childRunId);
    if (now === null) return;
    await this.#recordIfTaken(parentRunId, { type: "child", at: this.#now(), childRunId, ...now });
  }

  /** Tells a run's parent, if it has one, how the run is now. */
  async #tellParentOf(runId: string): Promise<void> {
    const parent = (await readRun(this.#options.store, runId))?.parent;
    if (parent != null) await this.#hearFromChild(parent.runId, runId);
  }

  /** Ends a run as cancelled, with `error`, and stops its harness calls. */
  async #cancelOne(runId: string, error: string): Promise<void> {
    await this.#fail(runId, error, "cancelled");
    await this.#harnessCalls.stop(runId);
  }

  /** Ends a run that hasn't ended with `run.failed`, and tells its feed and its parent. */
  async #fail(runId: string, error: string, reason: RunFailureReason = "error"): Promise<void> {
    if (!(await appendFailed(this.#options.store, runId, error, reason, () => this.#now()))) return;
    this.#feed.notify(runId);
    await this.#tellParentOf(runId);
  }

  async #summary(runId: string): Promise<RunSummary> {
    const summary = await this.#options.store.get(runId);
    if (summary === null) throw new Error(`Run "${runId}" has no log after it was recorded.`);
    return summary;
  }

  #now(): string {
    return this.#clock.now().toISOString();
  }
}
