// The model side of the local executor's runs: it carries out the model
// calls runs wait on, and stops them when their run is cancelled or ends,
// or the engine stops, as harness calls are stopped.

import type { RunStore } from "@halonicjs/ports";
import type { StopSignal } from "@halonicjs/std";
import type { ModelCallResult } from "../kernel/decide-types.ts";
import type { PendingCall, RunState } from "../kernel/run-state.ts";
import { LiveCalls, modelStopMessages } from "./live-calls.ts";
import { topLevelRunOf } from "./proposal-folders.ts";

/**
 * Carries out a model call a run waits on, and gives the model's answer, or
 * the tool call the agent stopped at because it needs a person's OK. When
 * `stop` is told to stop, the call ends: its request to the provider is
 * aborted and it throws the stop's reason.
 */
export type CallModel = (
  run: RunState,
  call: PendingCall,
  stop: StopSignal,
) => Promise<ModelCallResult>;

/** The model calls of the local executor's runs (requirement `engine.model-call-stop`). */
export class LocalModelCalls {
  readonly #store: RunStore;
  readonly #callModel: CallModel;
  readonly #live = new LiveCalls(modelStopMessages);

  constructor(store: RunStore, callModel: CallModel) {
    this.#store = store;
    this.#callModel = callModel;
  }

  /**
   * Makes the run's model call. A call that was told to stop gives `null`,
   * however it ended: a stop is not the call's failure, and whoever stopped
   * it has ended the run, so there is nothing to record.
   *
   * @throws what the call throws, when it wasn't stopped
   */
  async run(run: RunState, call: PendingCall): Promise<ModelCallResult | null> {
    const topLevelRunId = await topLevelRunOf(this.#store, run);
    let stopped = false;
    const calling = (stop: StopSignal) => {
      stop.onStop(() => {
        stopped = true;
      });
      return this.#callModel(run, call, stop);
    };
    try {
      const result = await this.#live.run(run.runId, calling, topLevelRunId);
      return stopped ? null : result;
    } catch (error) {
      if (stopped) return null;
      throw error;
    }
  }

  /**
   * Tells the run's model calls going on to stop, without waiting for them to end: a stopped
   * call records nothing, and a provider that ignores the abort mustn't hold up the cancel, or
   * a stopped command could never end (HAL-6677). {@link LocalModelCalls.stopAll} waits.
   */
  stop(runId: string): void {
    void this.#live.stop(runId);
  }

  /** Tells the model calls going on in a top-level run and its child runs to stop, as {@link LocalModelCalls.stop} does. */
  stopUnder(topLevelRunId: string): void {
    void this.#live.stopUnder(topLevelRunId);
  }

  /** Stops every model call going on, and resolves once each has ended; later calls are refused. */
  stopAll(): Promise<void> {
    return this.#live.stopAll();
  }
}
