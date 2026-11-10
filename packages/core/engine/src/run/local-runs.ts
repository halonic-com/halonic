// The run side of the local executor: it records each input with `step`,
// then carries out the effects through the scheduler, so a run moves on one
// step per timer and survives a restart of the process.

import type { RunSummary } from "@halonicjs/events";
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
import { InputRefused } from "../kernel/decide.ts";
import type { DecideInput, Effect, RunDefinitions } from "../kernel/decide-types.ts";
import { keepDefinitions } from "../kernel/kept-definitions.ts";
import type { PendingCall, RunState } from "../kernel/run-state.ts";
import { readRun, step } from "../kernel/step.ts";
import { endInterruptedRuns } from "./end-interrupted-runs.ts";
import { runFailureReasonOf } from "./run-failure-reason-of.ts";
import { RunFeed } from "./run-feed.ts";

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
}

/** Carries out a model call a run waits on, and gives the model's answer. */
export type CallModel = (run: RunState, call: PendingCall) => Promise<unknown>;

/** The longest run id, in UTF-8 bytes, because it is a `Scheduler` key. */
const maxRunIdBytes = 256;

/** Timer ids: a call to carry out now, and a timer a state set (`set-timer`). */
const callTimer = "call:";
const stateTimer = "timer:";

/** Runs workflows in this process for the local executor. */
export class LocalRuns {
  readonly #options: LocalRunsOptions;
  readonly #clock: Clock;
  readonly #callModel: CallModel;
  readonly #feed: RunFeed;
  /** The calls being carried out now, so a timer delivered twice makes one call. */
  readonly #calling = new Set<string>();
  #started: Promise<void> | undefined;

  constructor(options: LocalRunsOptions, clock: Clock, callModel: CallModel) {
    this.#options = options;
    this.#clock = clock;
    this.#callModel = callModel;
    this.#feed = new RunFeed(options.store);
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
    await this.#record(runId, {
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
   * A timer of a run is due: carry out the call it names, or pass the run
   * the timer a state set. A timer that is late, repeated or no longer
   * wanted changes nothing, so this resolves for it.
   */
  async onTimer(timer: ScheduledTimer): Promise<void> {
    await this.#ready();
    if (timer.timerId.startsWith(callTimer)) {
      await this.#carryOutCall(timer.key, timer.timerId.slice(callTimer.length));
    } else if (timer.timerId.startsWith(stateTimer)) {
      const key = timer.timerId.slice(stateTimer.length);
      await this.#recordIfTaken(timer.key, { type: "timer", at: this.#now(), key });
    }
  }

  /**
   * Before the first run starts or resumes, end the runs the engine lost
   * when it last stopped. A failure is tried again on the next call.
   */
  #ready(): Promise<void> {
    this.#started ??= endInterruptedRuns(this.#options.store, this.#clock).then(
      (ended) => {
        for (const runId of ended) this.#feed.notify(runId);
      },
      (error: unknown) => {
        this.#started = undefined;
        throw error;
      },
    );
    return this.#started;
  }

  async #carryOutCall(runId: string, callId: string): Promise<void> {
    const run = await readRun(this.#options.store, runId);
    const call = run?.pendingCall;
    const slot = JSON.stringify([runId, callId]);
    if (run == null || call == null || call.callId !== callId || this.#calling.has(slot)) {
      return;
    }
    this.#calling.add(slot);
    try {
      await this.#recordIfTaken(runId, await this.#callResult(run, call));
    } finally {
      this.#calling.delete(slot);
    }
  }

  /** The input a call gives: its answer, or why it failed. */
  async #callResult(run: RunState, call: PendingCall): Promise<DecideInput> {
    try {
      const output = await this.#callModel(run, call);
      const result = { type: "model", output } as const;
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

  /** As {@link LocalRuns.#record}, but an input the run no longer takes changes nothing. */
  async #recordIfTaken(runId: string, input: DecideInput): Promise<void> {
    try {
      await this.#record(runId, input);
    } catch (error) {
      if (!(error instanceof InputRefused)) throw error;
    }
  }

  /** Steps the run with the input, tells the subscribers, and sets timers for the effects. */
  async #record(runId: string, input: DecideInput): Promise<void> {
    const ports = { runs: this.#options.store, blobs: this.#options.blobs };
    const { events, effects } = await step(ports, runId, input);
    if (events.length > 0) this.#feed.notify(runId);
    for (const effect of effects) {
      await this.#schedule(runId, effect);
    }
  }

  async #schedule(runId: string, effect: Effect): Promise<void> {
    const scheduler = this.#options.scheduler;
    switch (effect.type) {
      case "call-model":
        return scheduler.schedule(runId, `${callTimer}${effect.callId}`, this.#now());
      case "set-timer":
        return scheduler.schedule(runId, `${stateTimer}${effect.key}`, effect.at);
      default:
        // Tool calls arrive with the agent loop (4a), child runs with step 5(a).
        throw new Error(`The local executor can't carry out a ${effect.type} effect yet.`);
    }
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
