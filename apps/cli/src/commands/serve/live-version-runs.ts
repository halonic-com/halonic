import type { RunVersion } from "@halonicjs/events";
import type { RunExecutor } from "@halonicjs/ports";

/**
 * The executor `serve` gives the server: a start that names no version reads
 * the live one, as a routine's run does, so it records which version it ran
 * and an agent in a harness has a copy of that version to work in. Without
 * it a served run of such an agent was refused as if history were off. The
 * server's start routes never pass a version, so a caller can't pick one.
 * Everything else goes to `executor` as it is.
 *
 * @param liveVersion the version a run started now reads; `null` while nothing is live
 * @throws from `start` when nothing is live, so no run is recorded
 */
export function startsOnLiveVersion(
  executor: RunExecutor,
  liveVersion: () => Promise<RunVersion | null>,
): RunExecutor {
  return {
    id: executor.id,
    start: async (request) => {
      if (request.version !== undefined) return await executor.start(request);
      const version = await liveVersion();
      if (version === null) throw new Error("No version of the workspace is live yet.");
      return await executor.start({ ...request, version });
    },
    startAgent: (request) => executor.startAgent(request),
    send: (runId, event, payload, options) => executor.send(runId, event, payload, options),
    subscribe: (runId, afterSeq, listener) => executor.subscribe(runId, afterSeq, listener),
    ...(executor.cancel === undefined ? {} : { cancel: (runId) => executor.cancel?.(runId) }),
    chatTurn: (request) => executor.chatTurn(request),
  } as RunExecutor;
}
