import type { RunEvent, RunSummary } from "@halonicjs/events";
import type { Fetcher } from "./host-client.ts";

/** One request the fake host received. */
export interface Call {
  readonly method: string;
  /** The path and the query. */
  readonly path: string;
  readonly headers: Headers;
  /** The parsed JSON body, or `undefined` when there was none. */
  readonly body: unknown;
}

/** A host a test scripts: `handler` answers each request, and every request is recorded. */
export function fakeHost(handler: (call: Call, number: number) => Response | Promise<Response>): {
  fetch: Fetcher;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetcher: Fetcher = async (request) => {
    const url = new URL(request.url);
    const text = await request.text();
    const call: Call = {
      method: request.method,
      path: `${url.pathname}${url.search}`,
      headers: request.headers,
      body: text === "" ? undefined : JSON.parse(text),
    };
    calls.push(call);
    return handler(call, calls.length);
  };
  return { fetch: fetcher, calls };
}

/** The host's error body. */
export function errorBody(status: number, code: string, message = "Refused."): Response {
  return Response.json({ code, message }, { status });
}

/** A signed-in answer to the login: a session cookie. */
export function loginResponse(token = "session-1"): Response {
  const response = Response.json({ signedIn: true });
  response.headers.append("Set-Cookie", `halonic-session=${token}; Path=/; HttpOnly; Max-Age=3600`);
  return response;
}

/** A run event with only the fields the client reads. */
export function eventAt(seq: number): RunEvent {
  return { seq, type: "run.started" } as unknown as RunEvent;
}

/** A run summary with only its id. */
export function summaryOf(id: string): RunSummary {
  return { id, status: "running" } as unknown as RunSummary;
}

/** The text the host sends for one run event. */
export function runFrame(seq: number): string {
  return `id: ${seq}\nevent: run\ndata: ${JSON.stringify(eventAt(seq))}\n\n`;
}

/** The text the host sends when a run has ended. */
export const endFrame = "event: end\ndata: {}\n\n";

/**
 * An event stream that sends `chunks` and then closes. When `breaks` is set the
 * connection fails instead of closing, as a dropped connection does.
 */
export function sseResponse(chunks: readonly string[], breaks = false): Response {
  const encoder = new TextEncoder();
  // One chunk per read, so a failure comes after the chunks before it were read, as on a real connection.
  const pending = [...chunks];
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = pending.shift();
      if (chunk !== undefined) controller.enqueue(encoder.encode(chunk));
      else if (breaks) controller.error(new TypeError("terminated"));
      else controller.close();
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
}
