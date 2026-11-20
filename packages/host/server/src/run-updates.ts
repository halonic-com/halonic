import type { RunUpdateFrame } from "./engine-api.ts";

/** The engine's feed of run summary changes, for `GET /api/run-updates`. */
export interface RunUpdates {
  /**
   * Calls `listener` once for every change of a run's summary in the
   * workspace, from now on, until the returned function is called. It keeps
   * no history: a change before the call is never given.
   */
  follow(listener: (update: RunUpdateFrame) => void): () => void;
}

/**
 * How many frames may wait for a client that doesn't read. Past that the
 * stream ends, rather than hold memory for a stalled caller; the page then
 * connects again and reads every run once, as it does on any reconnect.
 */
const maxWaitingFrames = 256;

/**
 * `GET /api/run-updates`: a server-sent event stream with one `changed`
 * event per run summary change, its data a {@link RunUpdateFrame} with only
 * `runId`, `status` and `seq`. There is no id, no `Last-Event-ID` resume and
 * no replay. The feed is followed for as long as the client stays connected.
 */
export function streamRunUpdates(updates: RunUpdates, request: Request): Response {
  const encoder = new TextEncoder();
  let unfollow: (() => void) | undefined;
  // Set once the stream is over, so a change the feed still delivers is dropped, not enqueued on a closed stream.
  let ended = false;
  const stop = () => {
    if (ended) return;
    ended = true;
    unfollow?.();
    request.signal.removeEventListener("abort", stop);
  };
  const body = new ReadableStream<Uint8Array>(
    {
      start(controller) {
        unfollow = updates.follow(({ runId, status, seq }) => {
          if (ended) return;
          if ((controller.desiredSize ?? 0) <= 0) {
            stop();
            controller.close();
            return;
          }
          // Only these three fields, whatever else the feed's object holds.
          const data = JSON.stringify({ runId, status, seq });
          controller.enqueue(encoder.encode(`event: changed\ndata: ${data}\n\n`));
        });
        // A client that goes away closes the request, and the feed goes with it.
        request.signal.addEventListener("abort", stop);
      },
      cancel: stop,
    },
    // Without a `size`, each frame counts as one.
    { highWaterMark: maxWaitingFrames },
  );
  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // A proxy that buffers the body would hold every event back.
      "X-Accel-Buffering": "no",
    },
  });
}
