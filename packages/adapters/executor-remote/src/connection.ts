import type { EngineConnection, EngineConnectionState } from "@halonicjs/ports";

/**
 * The remote executor's {@link EngineConnection}. It is `lost` while at least one
 * run stream is down and retrying, and `connected` otherwise, so one stream that
 * comes back doesn't hide another that is still down.
 */
export class ConnectionTracker implements EngineConnection {
  readonly #down = new Set<symbol>();
  readonly #listeners = new Set<(state: EngineConnectionState) => void>();
  readonly #report: (error: unknown) => void;

  /** @param report - gets what a listener throws; the tracker carries on */
  constructor(report: (error: unknown) => void) {
    this.#report = report;
  }

  get state(): EngineConnectionState {
    return this.#down.size === 0 ? "connected" : "lost";
  }

  onChange(listener: (state: EngineConnectionState) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** Marks the stream `stream` as down (`true`) or up (`false`, also when it ended or closed). */
  setDown(stream: symbol, isDown: boolean): void {
    const before = this.state;
    if (isDown) this.#down.add(stream);
    else this.#down.delete(stream);
    if (this.state === before) {
      return;
    }
    for (const listener of [...this.#listeners]) {
      try {
        listener(this.state);
      } catch (error) {
        this.#report(error);
      }
    }
  }
}
