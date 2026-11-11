// The harness calls an engine is running, so that when it stops, every
// program they started stops with it (failure path, rule 2), and when a run
// is cancelled, its own programs stop.

import { type StopSignal, StopSource } from "@halonicjs/std";

/** The `error` a harness call stops with when the engine stops while it runs. */
export const engineStoppedMessage = "The engine stopped while the harness ran.";

/** The `error` a harness call stops with when its run is cancelled while it runs. */
export const runCancelledMessage = "The run was cancelled while the agent was working.";

/** The `error` a harness call stops with when its top-level run ended while it ran. */
export const runEndedMessage = "The run ended while the agent was working.";

/** One harness call going on now. */
interface LiveCall {
  readonly runId: string;
  /** The top-level run the call's run belongs to: the run itself, or the one that started it. */
  readonly topLevelRunId: string;
  readonly source: StopSource;
  /** Settles once the call has stopped everything it started. */
  readonly done: Promise<void>;
}

/** The harness calls this engine is running now. */
export class LiveHarnessCalls {
  readonly #calls = new Set<LiveCall>();
  #stopped = false;

  /**
   * Runs one harness call of the run with a signal that is told to stop when
   * the engine stops or the run is cancelled.
   *
   * @param topLevelRunId - the top-level run `runId` belongs to, for {@link LiveHarnessCalls.stopUnder}
   * @throws an engine-stopped error, before starting anything, once {@link LiveHarnessCalls.stopAll} was called
   * @throws what the call throws
   */
  async run<T>(
    runId: string,
    call: (stop: StopSignal) => Promise<T>,
    topLevelRunId = runId,
  ): Promise<T> {
    if (this.#stopped) throw new Error(engineStoppedMessage);
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
   * Stops the run's calls going on, and resolves once each has stopped its
   * harness run, session and bridge. Later calls of the run are not refused:
   * a cancelled run records none.
   *
   * @param message - the `error` the calls stop with; a cancelled run's when left out
   */
  async stop(runId: string, message = runCancelledMessage): Promise<void> {
    const calls = [...this.#calls].filter((call) => call.runId === runId);
    await stopCalls(calls, message);
  }

  /**
   * Stops the calls going on in a top-level run and in every child run under
   * it, and resolves once each has stopped all it started: the run has ended,
   * and nothing of it may write in its proposal folder any more.
   */
  async stopUnder(topLevelRunId: string): Promise<void> {
    const calls = [...this.#calls].filter((call) => call.topLevelRunId === topLevelRunId);
    await stopCalls(calls, runEndedMessage);
  }

  /**
   * Stops every call going on, and resolves once each has stopped its
   * harness run, session and bridge. Calls after this are refused.
   */
  async stopAll(): Promise<void> {
    this.#stopped = true;
    await stopCalls([...this.#calls], engineStoppedMessage);
  }
}

/** Tells each call to stop with `message`, and resolves once all have stopped. */
async function stopCalls(calls: readonly LiveCall[], message: string): Promise<void> {
  for (const call of calls) {
    call.source.stop(new Error(message));
  }
  await Promise.all(calls.map((call) => call.done));
}
