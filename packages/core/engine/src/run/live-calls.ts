// The calls an engine is running, harness or model, so that when it stops,
// every call stops with it (failure path, rule 2), and when a run is
// cancelled, its own calls stop: a harness call with every program it
// started, a model call with its request to the provider.

import { type StopSignal, StopSource } from "@halonicjs/std";

/** The `error` a harness call stops with when the engine stops while it runs. */
export const engineStoppedMessage = "The engine stopped while the harness ran.";

/** The `error` a harness call stops with when its run is cancelled while it runs. */
export const runCancelledMessage = "The run was cancelled while the agent was working.";

/** The `error` a harness call stops with when its top-level run ended while it ran. */
export const runEndedMessage = "The run ended while the agent was working.";

/** The `error` a model call stops with when the engine stops while it runs. */
export const modelEngineStoppedMessage = "The engine stopped while the model was answering.";

/** The `error` a model call stops with when its run is cancelled while it runs. */
export const modelRunCancelledMessage = "The run was cancelled while the model was answering.";

/** The `error` a model call stops with when its top-level run ended while it ran. */
export const modelRunEndedMessage = "The run ended while the model was answering.";

/** The `error` each way of stopping gives the calls of one {@link LiveCalls}. */
export interface StopMessages {
  readonly engineStopped: string;
  readonly runCancelled: string;
  readonly runEnded: string;
}

/** What harness calls stop with. */
export const harnessStopMessages: StopMessages = {
  engineStopped: engineStoppedMessage,
  runCancelled: runCancelledMessage,
  runEnded: runEndedMessage,
};

/** What model calls stop with. */
export const modelStopMessages: StopMessages = {
  engineStopped: modelEngineStoppedMessage,
  runCancelled: modelRunCancelledMessage,
  runEnded: modelRunEndedMessage,
};

/** One call going on now. */
interface LiveCall {
  readonly runId: string;
  /** The top-level run the call's run belongs to: the run itself, or the one that started it. */
  readonly topLevelRunId: string;
  readonly source: StopSource;
  /** Settles once the call has stopped everything it started. */
  readonly done: Promise<void>;
}

/** The calls of one kind this engine is running now, such as its harness calls. */
export class LiveCalls {
  readonly #calls = new Set<LiveCall>();
  readonly #messages: StopMessages;
  #stopped = false;

  /** @param messages - what the calls stop with; a harness call's when left out */
  constructor(messages: StopMessages = harnessStopMessages) {
    this.#messages = messages;
  }

  /**
   * Runs one call of the run with a signal that is told to stop when the
   * engine stops or the run is cancelled.
   *
   * @param topLevelRunId - the top-level run `runId` belongs to, for {@link LiveCalls.stopUnder}
   * @throws an engine-stopped error, before starting anything, once {@link LiveCalls.stopAll} was called
   * @throws what the call throws
   */
  async run<T>(
    runId: string,
    call: (stop: StopSignal) => Promise<T>,
    topLevelRunId = runId,
  ): Promise<T> {
    if (this.#stopped) throw new Error(this.#messages.engineStopped);
    const source = new StopSource();
    const result = call(source.signal);
    const live: LiveCall = {
      runId,
      topLevelRunId,
      source,
      done: result.then(
        () => {},
        () => {},
      ),
    };
    this.#calls.add(live);
    try {
      return await result;
    } finally {
      this.#calls.delete(live);
    }
  }

  /**
   * Stops the run's calls going on, and resolves once each has stopped all
   * it started. Later calls of the run are not refused: a cancelled run
   * records none.
   *
   * @param message - the `error` the calls stop with; a cancelled run's when left out
   */
  async stop(runId: string, message = this.#messages.runCancelled): Promise<void> {
    const calls = [...this.#calls].filter((call) => call.runId === runId);
    await stopCalls(calls, message);
  }

  /**
   * Stops the calls going on in a top-level run and in every child run under
   * it, and resolves once each has stopped all it started: the run has ended,
   * and nothing of it may write in its proposal folder any more.
   *
   * Never call it from inside a live call of that run: it waits on
   * the call's `done`, so the call would wait on itself for ever.
   */
  async stopUnder(topLevelRunId: string): Promise<void> {
    const calls = [...this.#calls].filter((call) => call.topLevelRunId === topLevelRunId);
    await stopCalls(calls, this.#messages.runEnded);
  }

  /**
   * Stops every call going on, and resolves once each has stopped all it
   * started. Calls after this are refused.
   */
  async stopAll(): Promise<void> {
    this.#stopped = true;
    await stopCalls([...this.#calls], this.#messages.engineStopped);
  }
}

/** Tells each call to stop with `message`, and resolves once all have stopped. */
async function stopCalls(calls: readonly LiveCall[], message: string): Promise<void> {
  for (const call of calls) {
    call.source.stop(new Error(message));
  }
  await Promise.all(calls.map((call) => call.done));
}
