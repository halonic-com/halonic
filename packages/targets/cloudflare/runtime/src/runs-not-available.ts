import {
  AgentRunsNotAvailable,
  type RunEventListener,
  type RunExecutor,
  type RunSubscription,
} from "@halonicjs/ports";

const notAvailable = "Runs aren't started through the Cloudflare Worker yet.";

/**
 * The run executor of a Worker that serves the API but starts no runs yet.
 * Starting a run answers 501 (the server maps {@link AgentRunsNotAvailable}),
 * and a stream of a run's events ends with an error, so a client asks again.
 * The Worker's executor ({@link workerRuns}) replaces that stream with the real one.
 * The routines tick and the run objects stay as they are.
 */
export const runsNotAvailable: RunExecutor = {
  id: "cloudflare-worker",
  async start() {
    throw new AgentRunsNotAvailable(notAvailable);
  },
  async startAgent() {
    throw new AgentRunsNotAvailable(notAvailable);
  },
  async send() {
    throw new Error(notAvailable);
  },
  subscribe(_runId, _afterSeq, listener) {
    let closed = false;
    queueMicrotask(() => {
      if (!closed) listener.onClose(new Error(notAvailable));
    });
    return {
      close() {
        closed = true;
      },
    };
  },
  async chatTurn() {
    throw new Error(notAvailable);
  },
};

/** Where a run's live events come from: the run objects. */
export interface RunEventSource {
  subscribe(runId: string, afterSeq: number, listener: RunEventListener): RunSubscription;
}

/**
 * The run executor of the Worker: runs can't be started yet, but the events of a run in a run
 * object (an imported one, say) stream live, with the same bytes and resume rules as on `serve`.
 */
export function workerRuns(events: RunEventSource): RunExecutor {
  return {
    ...runsNotAvailable,
    subscribe: (runId, afterSeq, listener) => events.subscribe(runId, afterSeq, listener),
  };
}
