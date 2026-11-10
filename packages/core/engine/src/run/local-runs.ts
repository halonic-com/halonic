// The run side of the local executor: it records each input with `step`,
// then carries out the effects through the scheduler, so a run moves on one
// step per timer, and a timer that is late or repeated changes nothing.

import { type RunEvent, type RunSummary, summarize } from "@halonicjs/events";
import type {
  BlobStore,
  Clock,
  IdGenerator,
  RunEventListener,
  RunStore,
  RunSubscription,
  ScheduledTimer,
  Scheduler,
  SendOptions,
  StartRunRequest,
} from "@halonicjs/ports";
import { encodeUtf8 } from "@halonicjs/std";
import type { HarnessRunsOptions } from "../harness/harness-host.ts";
import { runHarnessCall } from "../harness/run-harness-call.ts";
import { SerialRunLog } from "../harness/serial-run-log.ts";
import { checkStartTimeouts } from "../harness/start-limits.ts";
import type {
  DecideInput,
  Effect,
  ModelCallResult,
  RunDefinitions,
  StartChildEffect,
} from "../kernel/decide-types.ts";
import { InputRefused } from "../kernel/input-refused.ts";
import {
  keepDefinitions,
  missingDefinitionsError,
  readDefinitions,
} from "../kernel/kept-definitions.ts";
import type { PendingCall, RunState } from "../kernel/run-state.ts";
import { readRun, step } from "../kernel/step.ts";
import { childNow, childStart, receiverOf } from "./child-runs.ts";
import { endInterruptedRuns } from "./end-interrupted-runs.ts";
import { LiveHarnessCalls } from "./live-harness-calls.ts";
import { runFailureReasonOf } from "./run-failure-reason-of.ts";
import { RunFeed } from "./run-feed.ts";
import { StartDeadlines } from "./start-deadlines.ts";

/** What the local executor needs to run workflows, on top of what chat turns need. */
export interface LocalRunsOptions {
  readonly store: RunStore;
  /** Where each run keeps the definitions it started with. */
  readonly blobs: BlobStore;
  /**
   * Wakes runs. Its listener's `onTimer` must call the executor's `onTimer`;
   * create it with a listener that forwards to the executor once it exists.
   */
  readonly scheduler: Scheduler;
  /** Gives a run its id when the start request names none. */
  readonly ids: IdGenerator;
  /**
   * The definitions a new run of a workflow starts with, as the workspace has
   * them now. The run keeps them, and never reads the workspace again.
   *
   * @throws when the hub or the workflow doesn't exist
   */
  definitionsOf(hubId: string, workflowId: string): Promise<RunDefinitions>;
  /**
   * What runs whose agents name a harness need. Without it, such a run fails
   * at its harness step with an error that names the `run-harness` effect.
   */
  readonly harnesses?: HarnessRunsOptions;
}

/**
 * Carries out a model call a run waits on, and gives the model's answer, or
 * the tool call the agent stopped at because it needs a person's OK.
 */
export type CallModel = (run: RunState, call: PendingCall) => Promise<ModelCallResult>;

/** The longest run id, in UTF-8 bytes, because it is a `Scheduler` key. */
const maxRunIdBytes = 256;

/**
 * Timer ids: a model call or a harness run to carry out now, a timer a
 * state set (`set-timer`), and a child run to hear from (on the parent's
 * key). A harness call's start limits have their own (see {@link StartDeadlines}).
 */
const callTimer = "call:";
const harnessTimer = "harness:";
const stateTimer = "timer:";
const childTimer = "child:";

/** How a call a run waits on is carried out: a model call, or a run of the agent's harness. */
type CallKind = "model" | "harness";

/**
 * The effects this executor carries out: harness runs only when it has
 * `harnesses`. Tool calls arrive with the agent loop (4a).
 */
function builtEffectsOf(options: LocalRunsOptions): ReadonlySet<Effect["type"]> {
  const built: Effect["type"][] = ["call-model", "set-timer", "start-child", "tell-parent"];
  if (options.harnesses !== undefined) built.push("run-harness");
  return new Set(built);
}

/** Runs workflows in this process for the local executor. */
export class LocalRuns {
  readonly #options: LocalRunsOptions;
  readonly #clock: Clock;
  readonly #callModel: CallModel;
  readonly #feed: RunFeed;
  readonly #startDeadlines: StartDeadlines;
  readonly #builtEffects: ReadonlySet<Effect["type"]>;
  /** The calls being carried out now, so a timer delivered twice makes one call. */
  readonly #calling = new Set<string>();
  readonly #harnessCalls = new LiveHarnessCalls();
  #started: Promise<void> | undefined;
  /** Set by {@link LocalRuns.close}: timers change nothing and calls record nothing from then on. */
  #closed = false;

  /** @throws RangeError when a start limit in `harnesses` isn't a whole number of milliseconds of 1 or more */
  constructor(options: LocalRunsOptions, clock: Clock, callModel: CallModel) {
    checkStartTimeouts(options.harnesses?.startTimeoutsMs);
    this.#options = options;
    this.#clock = clock;
    this.#callModel = callModel;
    this.#feed = new RunFeed(options.store);
    this.#startDeadlines = new StartDeadlines(options.scheduler, clock);
    this.#builtEffects = builtEffectsOf(options);
  }

  /**
   * Records the start of a run and sets the timer for its first effects. A
   * `runId` that already exists returns that run and starts nothing.
   *
   * @throws RangeError when `runId` is longer than 256 UTF-8 bytes
   * @throws when the hub or workflow doesn't exist
   */
  async start(request: StartRunRequest): Promise<RunSummary> {
    if (request.runId !== undefined && encodeUtf8(request.runId).length > maxRunIdBytes) {
      throw new RangeError(`A run id is at most ${maxRunIdBytes} UTF-8 bytes.`);
    }
    await this.#ready();
    const runId = request.runId ?? this.#options.ids.next("run");
    const existing = await this.#options.store.get(runId);
    if (existing !== null) return existing;
    const { hubId, workflowId, input, trigger } = request;
    const definitions = await this.#options.definitionsOf(hubId, workflowId);
    const definitionsVersion = await keepDefinitions(this.#options.blobs, definitions);
    try {
      await this.#record(runId, {
        type: "start",
        at: this.#now(),
        runId,
        hubId,
        workflowId,
        input,
        kind: request.kind ?? "run",
        definitionsVersion,
        ...(trigger === undefined ? {} : { trigger }),
      });
    } catch (error) {
      // A start repeated at the same moment: the other one recorded it.
      if (!(error instanceof InputRefused && error.code === "engine.run-exists")) throw error;
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

  subscribe(runId: string, afterSeq: number, listener: RunEventListener): RunSubscription {
    return this.#feed.subscribe(runId, afterSeq, listener, this.#ready());
  }

  /**
   * A timer of a run is due: carry out the call it names, end a harness
   * start whose time is up, or pass the run the timer a state set. A timer
   * that is late, repeated or no longer wanted changes nothing, so this
   * resolves for it, and so does every timer after {@link LocalRuns.close}.
   */
  async onTimer(timer: ScheduledTimer): Promise<void> {
    if (this.#closed) return;
    await this.#ready();
    if (StartDeadlines.owns(timer)) {
      this.#startDeadlines.expire(timer);
    } else if (timer.timerId.startsWith(callTimer)) {
      await this.#carryOutCall(timer.key, timer.timerId.slice(callTimer.length), "model");
    } else if (timer.timerId.startsWith(harnessTimer)) {
      await this.#carryOutCall(timer.key, timer.timerId.slice(harnessTimer.length), "harness");
    } else if (timer.timerId.startsWith(stateTimer)) {
      const key = timer.timerId.slice(stateTimer.length);
      await this.#recordIfTaken(timer.key, { type: "timer", at: this.#now(), key });
    } else if (timer.timerId.startsWith(childTimer)) {
      await this.#hearFromChild(timer.key, timer.timerId.slice(childTimer.length));
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
   * finds the runs it ended.
   */
  async #endInterruptedRuns(): Promise<void> {
    const ended = await endInterruptedRuns(this.#options.store, this.#clock);
    for (const runId of ended) this.#feed.notify(runId);
    for (const runId of ended) {
      const parent = (await readRun(this.#options.store, runId))?.parent;
      if (parent == null) continue;
      await this.#options.scheduler.schedule(parent.runId, `${childTimer}${runId}`, this.#now());
    }
  }

  async #carryOutCall(runId: string, callId: string, kind: CallKind): Promise<void> {
    // Claim the slot before the read: a delivery whose read ends after the
    // first call is recorded and the slot freed would still see the call.
    const slot = JSON.stringify([runId, callId]);
    if (this.#calling.has(slot)) return;
    this.#calling.add(slot);
    try {
      const run = await readRun(this.#options.store, runId);
      const call = run?.pendingCall;
      if (run == null || call == null || call.callId !== callId) return;
      const result = await this.#callResult(run, call, kind);
      if (this.#closed) return;
      await this.#recordIfTaken(runId, result);
    } finally {
      this.#calling.delete(slot);
    }
  }

  /** The input a call gives: its answer, or why it failed. */
  async #callResult(run: RunState, call: PendingCall, kind: CallKind): Promise<DecideInput> {
    try {
      const result =
        kind === "model"
          ? await this.#callModel(run, call)
          : { type: "harness" as const, output: await this.#runHarness(run, call) };
      return { type: "effect-done", at: this.#now(), callId: call.callId, result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failure = runFailureReasonOf(error);
      return {
        type: "effect-failed",
        at: this.#now(),
        callId: call.callId,
        error: message,
        ...failure,
      };
    }
  }

  /**
   * Runs the agent of a harness call in its harness. The harness comes from
   * the agent's file in the run's kept definitions, the same file `decide`
   * read when it asked for the run.
   *
   * @throws when the executor has no `harnesses`, the definitions are gone,
   *   the agent names no harness, the harness run fails, or the engine stops it
   */
  async #runHarness(run: RunState, call: PendingCall): Promise<unknown> {
    const harnesses = this.#options.harnesses;
    if (harnesses === undefined) {
      throw new Error(
        "The local executor can't carry out a run-harness effect: it has no harnesses.",
      );
    }
    const definitions = await readDefinitions(this.#options.blobs, run.definitionsVersion);
    if (definitions === null) throw new Error(missingDefinitionsError(run.definitionsVersion));
    const agents = definitions.agents ?? {};
    const agent = Object.hasOwn(agents, call.agent) ? agents[call.agent] : undefined;
    const harness = agent?.harness;
    if (agent === undefined || harness === undefined || harness === "halonic") {
      throw new Error(
        `Agent "${call.agent}" names no harness in the definitions this run started with.`,
      );
    }
    const effect = { ...call, harness };
    const { runId, hubId, lastSeq } = run;
    const log = new SerialRunLog(this.#options.store, runId, call.callId, lastSeq, this.#clock);
    const limits = this.#startDeadlines.of(runId, call.callId);
    return this.#harnessCalls.run((stop) =>
      runHarnessCall(harnesses, { effect, runId, hubId, agent }, log, limits, stop),
    );
  }

  /** As {@link LocalRuns.#record}, but an input the run no longer takes changes nothing. */
  async #recordIfTaken(runId: string, input: DecideInput): Promise<void> {
    try {
      await this.#record(runId, input);
    } catch (error) {
      if (!(error instanceof InputRefused)) throw error;
    }
  }

  /** Steps the run with the input, tells the subscribers, and carries out or schedules the effects. */
  async #record(runId: string, input: DecideInput): Promise<void> {
    const ports = { runs: this.#options.store, blobs: this.#options.blobs };
    const { run, events, effects } = await step(ports, runId, input);
    if (events.length > 0) this.#feed.notify(runId);
    const unbuilt = effects.find((effect) => !this.#builtEffects.has(effect.type));
    if (unbuilt !== undefined) {
      // The events are stored, so throwing would leave the run going with no
      // timer to move it on. Until the agent loop (4a) carries these out,
      // the run fails and none of its effects are scheduled.
      await this.#fail(runId, `The local executor can't carry out a ${unbuilt.type} effect yet.`);
      return;
    }
    for (const effect of effects) {
      await this.#carryOut(run, effect);
    }
  }

  /**
   * Model calls and state timers wait for their timer. A child run starts
   * at once, and a parent hears from its child at once, so it goes on in
   * the same call; its timer is set first and kept only if that fails.
   */
  async #carryOut(run: RunState, effect: Effect): Promise<void> {
    const scheduler = this.#options.scheduler;
    if (effect.type === "call-model") {
      await scheduler.schedule(run.runId, `${callTimer}${effect.callId}`, this.#now());
    } else if (effect.type === "run-harness") {
      await scheduler.schedule(run.runId, `${harnessTimer}${effect.callId}`, this.#now());
    } else if (effect.type === "set-timer") {
      await scheduler.schedule(run.runId, `${stateTimer}${effect.key}`, effect.at);
    } else if (effect.type === "start-child") {
      await this.#startChild(run, effect);
    } else if (effect.type === "tell-parent") {
      const timerId = `${childTimer}${effect.childRunId}`;
      await scheduler.schedule(effect.parentRunId, timerId, this.#now());
      await this.#hearFromChild(effect.parentRunId, effect.childRunId);
      await scheduler.cancel(effect.parentRunId, timerId);
    }
  }

  /**
   * Starts a child run; one that can't start fails its parent with the
   * reason. An error after the child's start is recorded goes to the caller.
   */
  async #startChild(parent: RunState, effect: StartChildEffect): Promise<void> {
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

  /** Gives the parent a `child` input with how its child is now; a running child tells nothing. */
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

  /** Ends a run that hasn't ended with `run.failed`, reading again when another write got there first. */
  async #fail(runId: string, error: string): Promise<void> {
    const store = this.#options.store;
    for (;;) {
      const summary = summarize(await store.events(runId));
      if (summary === null || summary.status === "completed" || summary.status === "failed") return;
      const failed: RunEvent = {
        runId,
        seq: summary.lastSeq + 1,
        at: this.#now(),
        type: "run.failed",
        state: summary.state,
        error,
        reason: "error",
      };
      if ((await store.append(runId, summary.lastSeq, [failed])).ok) break;
    }
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
