import type { RunEventListener, RunSubscription } from "@halonicjs/ports";
import type { ServerPorts } from "./api.ts";
import { errorResponse, serverErrors } from "./errors.ts";

type EventStreamPorts = Pick<ServerPorts, "runs" | "runStore" | "errorLog">;

/**
 * The sequence number after which a stream starts. A `Last-Event-ID` header
 * wins over `?after=`: a standard client that reconnects by itself repeats the
 * original URL and names the last id it saw in that header. Absent both means
 * from the first event. `null` when the value is anything but a whole number
 * written in digits.
 */
function parseAfter(request: Request): number | null {
  const value =
    request.headers.get("last-event-id") ?? new URL(request.url).searchParams.get("after");
  if (value === null) {
    return 0;
  }
  const after = /^\d{1,15}$/.test(value) ? Number(value) : Number.NaN;
  return Number.isSafeInteger(after) ? after : null;
}

/** One server-sent event: `id` is the event's `seq`, so a client resumes with the last id it saw. */
function frame(name: string, data: unknown, id?: number): string {
  const idLine = id === undefined ? "" : `id: ${id}\n`;
  // JSON.stringify never writes a raw newline, so the data is always one line.
  return `${idLine}event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * `GET /api/runs/<runId>/events?after=<seq>`: streams a run's durable events
 * as server-sent events. Each `run` message carries one event as JSON and its
 * `seq` as the message id. When the run has ended and every event was sent,
 * an `end` message follows and the stream closes. A stream that closes
 * without an `end` message broke, and the client asks again with the last
 * `seq` it saw. Reading is safe in a changed workspace, so it needs no trust.
 *
 * @param runId an id the caller already checked with `parseRunId`
 */
export async function streamRunEvents(
  { runs, runStore, errorLog }: EventStreamPorts,
  request: Request,
  runId: string,
): Promise<Response> {
  const after = parseAfter(request);
  if (after === null) {
    return errorResponse(serverErrors.badRequest);
  }
  if ((await runStore.get(runId)) === null) {
    return errorResponse(serverErrors.runNotFound);
  }

  const encoder = new TextEncoder();
  let subscription: RunSubscription | null = null;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (text: string) => controller.enqueue(encoder.encode(text));
      const stop = () => {
        subscription?.close();
        request.signal.removeEventListener("abort", stop);
      };
      const listener: RunEventListener = {
        onEvent(event) {
          send(frame("run", event, event.seq));
        },
        onClose(error) {
          if (error === undefined) {
            send(frame("end", {}));
          } else {
            // The cause stays in the log. No `end` message tells the client the stream broke.
            errorLog.record(error);
          }
          stop();
          controller.close();
        },
      };
      subscription = runs.subscribe(runId, after, listener);
      // A client that goes away closes the request, and the subscription goes with it.
      request.signal.addEventListener("abort", stop);
    },
    cancel() {
      subscription?.close();
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // A proxy that buffers the body would hold every event back.
      "X-Accel-Buffering": "no",
    },
  });
}
