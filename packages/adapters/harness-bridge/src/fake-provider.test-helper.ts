import type { Fetch } from "./pass-through.ts";

/** One call the bridge made to the fake provider. */
export interface UpstreamCall {
  url: string;
  headers: Headers;
  body: string;
  signal: AbortSignal;
}

/**
 * Stands in for a provider's host: records each call and answers with what
 * `reply` returns for it.
 */
export function fakeProvider(reply: (call: UpstreamCall) => Response | Promise<Response>) {
  const calls: UpstreamCall[] = [];
  const fetch: Fetch = async (input, init) => {
    const call = {
      url: String(input),
      headers: new Headers(init?.headers),
      body: new TextDecoder().decode(init?.body as Uint8Array),
      signal: init?.signal as AbortSignal,
    };
    calls.push(call);
    const response = await reply(call);
    if (response.body === null) return response;
    const { status, headers } = response;
    return new Response(endsOnAbort(response.body, call.signal), { status, headers });
  };
  return { calls, fetch };
}

/** A reply body that fails once the call is aborted, as Node's own `fetch` does. */
function endsOnAbort(body: ReadableStream<Uint8Array>, signal: AbortSignal) {
  const reader = body.getReader();
  return new ReadableStream<Uint8Array>({
    start: (controller) => {
      signal.addEventListener("abort", () => controller.error(signal.reason), { once: true });
    },
    pull: async (controller) => {
      const { done, value } = await reader.read();
      if (signal.aborted) return;
      if (done) controller.close();
      else controller.enqueue(value);
    },
  });
}

/** A reply stream the test feeds one chunk at a time. */
export function controlledStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start: (given) => {
      controller = given;
    },
  });
  return { body, push: (text: string) => controller.enqueue(new TextEncoder().encode(text)) };
}
