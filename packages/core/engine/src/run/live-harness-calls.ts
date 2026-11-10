// The harness calls an engine is running, so that when it stops, every
// program they started stops with it (failure path, rule 2).

import { type StopSignal, StopSource } from "@halonicjs/std";

/** The `error` a harness call stops with when the engine stops while it runs. */
export const engineStoppedMessage = "The engine stopped while the harness ran.";

/** One harness call going on now. */
interface LiveCall {
  readonly source: StopSource;
  /** Settles once the call has stopped everything it started. */
  readonly done: Promise<void>;
}

/** The harness calls this engine is running now. */
export class LiveHarnessCalls {
  readonly #calls = new Set<LiveCall>();
  #stopped = false;

  /**
   * Runs one harness call with a signal that is told to stop when the engine stops.
   *
   * @throws an engine-stopped error, before starting anything, once {@link LiveHarnessCalls.stopAll} was called
   * @throws what the call throws
   */
  async run<T>(call: (stop: StopSignal) => Promise<T>): Promise<T> {
    if (this.#stopped) throw new Error(engineStoppedMessage);
    const source = new StopSource();
    const result = call(source.signal);
    const live: LiveCall = {
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
   * Stops every call going on, and resolves once each has stopped its
   * harness run, session and bridge. Calls after this are refused.
   */
  async stopAll(): Promise<void> {
    this.#stopped = true;
    const calls = [...this.#calls];
    for (const call of calls) {
      call.source.stop(new Error(engineStoppedMessage));
    }
    await Promise.all(calls.map((call) => call.done));
  }
}
