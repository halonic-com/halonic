import { AgentRunsNotAvailable, type RunExecutor } from "@halonicjs/ports";

const notAvailable = "Runs aren't started through the Cloudflare Worker yet.";

/**
 * The run executor of a Worker that serves the API but starts no runs yet.
 * Starting a run answers 501 (the server maps {@link AgentRunsNotAvailable}),
 * and a stream of a run's events ends with an error, so a client asks again.
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
