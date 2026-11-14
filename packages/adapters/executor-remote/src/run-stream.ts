import type { RunEvent } from "@halonicjs/events";
import type { RunEventListener, RunSubscription } from "@halonicjs/ports";
import type { ConnectionTracker } from "./connection.ts";
import { isRetryable, RemoteProtocolError, readHostError } from "./errors.ts";
import type { HostClient } from "./host-client.ts";
import { readSseMessages } from "./sse.ts";

/** What {@link followRun} needs besides the run. */
export interface RunStreamOptions {
  readonly client: HostClient;
  readonly connection: ConnectionTracker;
  /** Waits `ms`, or less when `signal` aborts. A test passes one that returns at once. */
  readonly wait: (ms: number, signal: AbortSignal) => Promise<void>;
  /** The wait before each new try after a break; the last one repeats. */
  readonly retryDelaysMs: readonly number[];
  /** Gets what a listener throws; the stream carries on. */
  readonly report: (error: unknown) => void;
}

/** A `run` message's data as an event, or a protocol error when it isn't one. */
function parseRunEvent(data: string): RunEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    throw new RemoteProtocolError("The host sent a run event that isn't JSON.");
  }
  const seq = (parsed as { seq?: unknown } | null)?.seq;
  if (typeof seq !== "number" || !Number.isSafeInteger(seq) || seq < 1) {
    throw new RemoteProtocolError("The host sent a run event without a sequence number.");
  }
  return parsed as RunEvent;
}

/**
 * Follows a run's events through `GET /api/runs/<id>/events`. It delivers each
 * event once and in order. When the stream breaks (the connection drops, or the
 * host answers with a server error) it marks the engine connection lost, waits
 * and asks again after the last `seq` it delivered, until it gets through or the
 * caller closes the subscription. It ends the listener with an error only for
 * what retrying can't fix, such as an unknown run or a refused sign-in.
 */
export function followRun(
  options: RunStreamOptions,
  runId: string,
  afterSeq: number,
  listener: RunEventListener,
): RunSubscription {
  const { client, connection, wait, retryDelaysMs, report } = options;
  const controller = new AbortController();
  const { signal } = controller;
  const stream = Symbol(`stream of ${runId}`);
  let lastSeq = afterSeq;
  let breaks = 0;

  function deliver(event: RunEvent): void {
    if (event.seq <= lastSeq) {
      return;
    }
    lastSeq = event.seq;
    breaks = 0;
    try {
      listener.onEvent(event);
    } catch (error) {
      report(error);
    }
  }

  /** Reads one connection to its end. `true` when the host said the run ended, `false` when the stream broke. */
  async function readOnce(): Promise<boolean> {
    const path = `/api/runs/${encodeURIComponent(runId)}/events?after=${lastSeq}`;
    const response = await client.call(path, {
      method: "GET",
      signal,
      headers: { Accept: "text/event-stream" },
    });
    if (!response.ok || response.body === null) {
      throw await readHostError(response);
    }
    connection.setDown(stream, false);
    for await (const message of readSseMessages(response.body)) {
      if (message.event === "end") return true;
      if (message.event === "run") deliver(parseRunEvent(message.data));
    }
    return false;
  }

  function finish(error?: Error): void {
    // Closing wins: the port says `onClose` is not called for a subscription the caller closed.
    if (signal.aborted) {
      return;
    }
    connection.setDown(stream, false);
    listener.onClose(error);
  }

  /** Reads one connection and says what to do next. */
  async function tryOnce(): Promise<"ended" | "retry" | "closed" | Error> {
    try {
      return (await readOnce()) ? "ended" : "retry";
    } catch (error) {
      if (signal.aborted) return "closed";
      if (isRetryable(error)) return "retry";
      return error instanceof Error ? error : new Error(String(error));
    }
  }

  async function follow(): Promise<void> {
    while (!signal.aborted) {
      const outcome = await tryOnce();
      if (outcome === "ended") return finish();
      if (outcome === "closed") return;
      if (outcome !== "retry") return finish(outcome);
      connection.setDown(stream, true);
      const delay = retryDelaysMs[Math.min(breaks, retryDelaysMs.length - 1)] ?? 0;
      breaks += 1;
      await wait(delay, signal);
    }
  }

  // A rejection can only come from a listener or the tracker, both guarded above; a bug elsewhere must not vanish.
  follow().catch(report);

  return {
    close() {
      controller.abort();
      connection.setDown(stream, false);
    },
  };
}
