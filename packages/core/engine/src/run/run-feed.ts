import type { RunEventListener, RunStore, RunSubscription } from "@halonicjs/ports";
import { hasEnded } from "../kernel/run-state.ts";

/** One open subscription: who listens, and the last `seq` it was given. */
interface Follower {
  readonly runId: string;
  readonly listener: RunEventListener;
  lastSeq: number;
  open: boolean;
  /** The delivery under way, so deliveries to one follower never overlap. */
  delivering: Promise<void>;
}

/**
 * Streams runs' events to their subscribers, for the local executor's
 * `subscribe`. It reads every event from the store, never from memory, so a
 * subscriber gets them in order and without gaps. The executor calls
 * {@link RunFeed.notify} after each append; one engine writes to a store, so
 * no append goes unseen.
 */
export class RunFeed {
  readonly #runs: Pick<RunStore, "events" | "get">;
  readonly #followers = new Map<string, Set<Follower>>();

  constructor(runs: Pick<RunStore, "events" | "get">) {
    this.#runs = runs;
  }

  /**
   * Gives the listener the run's stored events after `afterSeq`, then new
   * ones as they are appended, until the run ends. The first delivery waits
   * for `ready`. The listener is never called before this returns.
   */
  subscribe(
    runId: string,
    afterSeq: number,
    listener: RunEventListener,
    ready: Promise<void>,
  ): RunSubscription {
    const follower: Follower = {
      runId,
      listener,
      lastSeq: afterSeq,
      open: true,
      delivering: ready,
    };
    const followers = this.#followers.get(runId) ?? new Set();
    followers.add(follower);
    this.#followers.set(runId, followers);
    this.#deliver(follower);
    return { close: () => this.#remove(follower) };
  }

  /** The run's log has moved on: deliver its new events. */
  notify(runId: string): void {
    for (const follower of this.#followers.get(runId) ?? []) {
      this.#deliver(follower);
    }
  }

  #deliver(follower: Follower): void {
    follower.delivering = follower.delivering
      .then(() => this.#catchUp(follower))
      .catch((error: unknown) => this.#close(follower, asError(error)));
  }

  async #catchUp(follower: Follower): Promise<void> {
    if (!follower.open) return;
    const run = await this.#runs.get(follower.runId);
    if (run === null) {
      throw new Error(`Run "${follower.runId}" doesn't exist.`);
    }
    for (const event of await this.#runs.events(follower.runId, follower.lastSeq)) {
      if (!follower.open) return;
      follower.listener.onEvent(event);
      follower.lastSeq = event.seq;
    }
    if (hasEnded(run.status) && follower.lastSeq >= run.lastSeq) {
      this.#close(follower);
    }
  }

  #close(follower: Follower, error?: Error): void {
    if (!follower.open) return;
    this.#remove(follower);
    follower.listener.onClose(error);
  }

  #remove(follower: Follower): void {
    follower.open = false;
    const followers = this.#followers.get(follower.runId);
    followers?.delete(follower);
    if (followers?.size === 0) this.#followers.delete(follower.runId);
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
