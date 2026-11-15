import type { HttpClient } from "@halonicjs/ports";
import type { TauriIpc } from "./tauri-ipc.ts";

/** What the shell answers to `http_request`. */
interface ShellAnswer {
  status: number;
  headers: [string, string][];
  body: string;
}

/** Statuses a `Response` may not carry a body with. */
const noBodyStatuses = new Set([101, 204, 205, 304]);

/**
 * The `HttpClient` that sends each request through the shell's `http_request`
 * command, because the page's content security policy stops it fetching a
 * model provider itself (HAL-10352). The shell reaches provider hosts only,
 * checks addresses and follows no redirect, so a 3xx answer comes back as it
 * is, and `redirect: "error"` turns it into a failure.
 *
 * The body is text, as a model provider's is: a request body that is not a
 * string is refused. `signal` ends the wait, though the shell's request runs on.
 *
 * @param ipc - the shell's IPC, from `tauriIpc`
 * @throws TypeError (from `fetch`) when the shell refuses or the body isn't text
 */
export function shellHttpClient(ipc: TauriIpc): HttpClient {
  return {
    async fetch(url: string, init: RequestInit = {}): Promise<Response> {
      const signal = init.signal ?? undefined;
      signal?.throwIfAborted();
      if (init.body !== undefined && init.body !== null && typeof init.body !== "string") {
        throw new TypeError("The shell sends a text body only.");
      }
      const request = {
        url,
        method: init.method ?? "GET",
        headers: [...new Headers(init.headers).entries()],
        body: init.body ?? null,
      };
      const call = ipc.invoke("http_request", { request }).then(
        (answer) => answer as ShellAnswer,
        (refusal: unknown) => {
          throw new TypeError(refusalText(refusal));
        },
      );
      const answer = await (signal === undefined ? call : raceAbort(call, signal));
      if (init.redirect === "error" && answer.status >= 300 && answer.status < 400) {
        throw new TypeError("The server redirected, and the request doesn't allow redirects.");
      }
      return new Response(noBodyStatuses.has(answer.status) ? null : answer.body, {
        status: answer.status,
        headers: answer.headers,
      });
    },
  };
}

/** Settles with `call`, or rejects with the signal's reason once it aborts. */
function raceAbort<T>(call: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    call.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

/** The shell's words for a refusal, without anything the request carried. */
function refusalText(refusal: unknown): string {
  if (typeof refusal === "object" && refusal !== null && "message" in refusal) {
    return String(refusal.message);
  }
  return typeof refusal === "string" ? refusal : "The shell refused the request.";
}
