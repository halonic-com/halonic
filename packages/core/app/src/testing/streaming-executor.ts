import { type RunEvent, type RunEventBody, type RunSummary, summarize } from "@halonicjs/events";
import type {
  RunEventListener,
  RunExecutor,
  RunSubscription,
  StartRunRequest,
} from "@halonicjs/ports";

const started: RunEventBody = {
  type: "run.started",
  hubId: "support",
  workflowId: "support-reply",
  input: {},
  kind: "run",
  definitionsVersion: "v1",
};

/**
 * A `RunExecutor` that keeps run logs and streams them as the port says:
 * the stored events after `afterSeq` first, then new ones, never before
 * `subscribe` returns. A deliberate fake: core may not use adapters, not
 * even in tests.
 */
export class StreamingExecutor implements Pick<RunExecutor, "start" | "subscribe"> {
  readonly starts: StartRunRequest[] = [];
  readonly subscribed: { runId: string; afterSeq: number }[] = [];
  /** Recorded by `start` after `run.started`, before it returns. */
  onStart: readonly RunEventBody[] = [];

  readonly #logs = new Map<string, RunEvent[]>();
  readonly #listeners = new Map<string, Set<RunEventListener>>();

  async start(request: StartRunRequest): Promise<RunSummary> {
    this.starts.push(request);
    const runId = `run_${this.starts.length}`;
    this.#logs.set(runId, []);
    this.append(runId, started, ...this.onStart);
    return this.summary(runId);
  }

  subscribe(runId: string, afterSeq: number, listener: RunEventListener): RunSubscription {
    this.subscribed.push({ runId, afterSeq });
    let open = true;
    // A microtask: core's types have no `queueMicrotask`.
    void Promise.resolve().then(() => {
      if (!open) return;
      // Like a real stream, the replay may go on after the listener closed
      // it from inside `onEvent`; it just isn't kept for new events then.
      for (const event of this.#logs.get(runId) ?? []) {
        if (event.seq > afterSeq) listener.onEvent(event);
      }
      if (open) this.#listenersOf(runId).add(listener);
    });
    return {
      close: () => {
        open = false;
        this.#listenersOf(runId).delete(listener);
      },
    };
  }

  /** Records events in a run's log and hands them to its open streams. */
  append(runId: string, ...bodies: readonly RunEventBody[]): void {
    const log = this.#logs.get(runId) ?? [];
    for (const body of bodies) {
      const event = { ...body, runId, seq: log.length + 1, at: "2026-11-10T10:00:00.000Z" };
      log.push(event);
      for (const listener of this.#listenersOf(runId)) listener.onEvent(event);
    }
    this.#logs.set(runId, log);
  }

  /** Ends a run's open streams, cleanly or with an error. */
  close(runId: string, error?: Error): void {
    for (const listener of this.#listenersOf(runId)) listener.onClose(error);
    this.#listenersOf(runId).clear();
  }

  openStreams(runId: string): number {
    return this.#listenersOf(runId).size;
  }

  summary(runId: string): RunSummary {
    const summary = summarize(this.#logs.get(runId) ?? []);
    if (summary === null) throw new Error(`no run ${runId}`);
    return summary;
  }

  #listenersOf(runId: string): Set<RunEventListener> {
    const listeners = this.#listeners.get(runId) ?? new Set();
    this.#listeners.set(runId, listeners);
    return listeners;
  }
}

/** Lets queued microtasks, such as a stream's replay, run. */
export async function settle(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
}
