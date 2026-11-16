import type { HttpClient } from "@halonicjs/ports";
import { type TauriIpc, tauriIpc } from "./tauri-ipc.ts";

/**
 * The shell keys a call by the page and this number, and refuses one that is
 * still open (`call_in_use`). A module runs once per page, so one counter
 * here keeps every client on the page apart.
 */
let nextCallId = 1;

/** What the shell answers: any status is an answer (`apps/studio/src-tauri/src/http_fetch.rs`). */
interface ShellAnswer {
  readonly status: number;
  readonly headers: readonly (readonly [string, string])[];
  readonly body: string;
  readonly url: string;
}

/** The statuses whose `Response` must have no body. */
const noBodyStatuses = new Set([101, 204, 205, 304]);

/**
 * An `HttpClient` whose calls the desktop shell makes, through its
 * `http_fetch` command. The shell checks the request, every address the host
 * name resolves to and every redirect hop, so a model provider that sends no
 * CORS headers works, and the key never goes through the webview's network
 * layer.
 *
 * The answer is read whole before it arrives (up to 32 MiB), as text, so a
 * streamed answer arrives all at once. A shell refusal throws an `Error`
 * whose `message` starts with the refusal's kind (`address_refused`,
 * `timeout`, ...) and whose `cause` is the shell's answer. Neither holds the
 * address or a header, which the shell keeps out of its messages.
 */
export class ShellHttpClient implements HttpClient {
  readonly #ipc: TauriIpc;

  constructor(ipc: TauriIpc) {
    this.#ipc = ipc;
  }

  async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    const signal = init.signal ?? undefined;
    signal?.throwIfAborted();
    const redirect = init.redirect ?? "follow";
    const request = {
      method: init.method ?? "GET",
      url,
      headers: [...new Headers(init.headers)],
      ...(init.body === undefined || init.body === null ? {} : { body: textBody(init.body) }),
      followRedirects: redirect === "follow",
    };
    const call = nextCallId++;
    const hangUp = (): void => {
      void this.#ipc.invoke("http_fetch_abort", { call }).catch(() => undefined);
    };
    signal?.addEventListener("abort", hangUp, { once: true });
    try {
      const answer = await raceAbort(
        this.#ipc.invoke("http_fetch", { request, call }) as Promise<ShellAnswer>,
        signal,
      );
      if (redirect === "error" && isRedirect(answer)) {
        throw new TypeError("The server answered with a redirect, which this call refuses.");
      }
      return toResponse(answer);
    } catch (error) {
      throw refusalError(error);
    } finally {
      signal?.removeEventListener("abort", hangUp);
    }
  }
}

/**
 * The shell's client, or `undefined` when the page isn't running in the
 * shell.
 *
 * @param page - the page's global object, usually `window`
 */
export function shellHttpClient(page: object): ShellHttpClient | undefined {
  const ipc = tauriIpc(page);
  return ipc === undefined ? undefined : new ShellHttpClient(ipc);
}

/** The shell takes text only; a stream or a binary body is refused here, before any call. */
function textBody(body: NonNullable<RequestInit["body"]>): string {
  if (typeof body === "string") {
    return body;
  }
  if (body instanceof URLSearchParams) {
    return body.toString();
  }
  throw new TypeError("The shell's HTTP client sends a string body only.");
}

function isRedirect(answer: ShellAnswer): boolean {
  return (
    answer.status >= 300 &&
    answer.status < 400 &&
    answer.headers.some(([name]) => name.toLowerCase() === "location")
  );
}

function toResponse(answer: ShellAnswer): Response {
  const response = new Response(noBodyStatuses.has(answer.status) ? null : answer.body, {
    status: answer.status,
    headers: answer.headers.map(([name, value]) => [name, value]),
  });
  // `url` is read-only on a constructed Response; callers read where an answer came from.
  Object.defineProperty(response, "url", { value: answer.url });
  return response;
}

/** Rejects as soon as the signal aborts, though the shell's own answer may come later. */
function raceAbort<T>(call: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) {
    return call;
  }
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    call.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

/** A shell refusal (`{ kind, message }`) as an `Error`; anything else as it is. */
function refusalError(error: unknown): unknown {
  if (typeof error === "object" && error !== null && "kind" in error && "message" in error) {
    return new Error(`${String(error.kind)}: ${String(error.message)}`, { cause: error });
  }
  return error;
}
