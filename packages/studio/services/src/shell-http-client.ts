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
 * address or a header, which the shell keeps out of its messages. A proxy
 * refusal throws a {@link ShellProxyError} instead, so the run reads it as
 * the CLI's proxy failure.
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
    const kind = String(error.kind);
    const message = String(error.message);
    return isProxyRefusal(kind)
      ? new ShellProxyError(kind, message, error)
      : new Error(`${kind}: ${message}`, { cause: error });
  }
  return error;
}

/**
 * The shell's proxy refusals (`apps/studio/src-tauri/src/http_fetch.rs`), by
 * the CLI's proxy problem each one is (`ProxyError` in
 * `@halonicjs/http-node`), with that problem's kit kind:
 * - `proxy_refused`: the proxy setting isn't one Halonic can use;
 * - `plain_http_proxied`: the host is plain `http://` and a proxy is set;
 * - `proxy`: the proxy couldn't be reached, or didn't take the connection.
 */
const proxyRefusals = {
  proxy_refused: { problem: "setting", kind: "invalid_input" },
  plain_http_proxied: { problem: "plain-http", kind: "denied" },
  proxy: { problem: "unreachable", kind: "unavailable" },
} as const;

type ProxyRefusalKind = keyof typeof proxyRefusals;

function isProxyRefusal(kind: string): kind is ProxyRefusalKind {
  return Object.hasOwn(proxyRefusals, kind);
}

/**
 * Thrown when the shell refused a call at the proxy. Like the CLI's
 * `ProxyError`, it carries a `kind` and a `failureCause` (`proxy.setting`,
 * `proxy.plain-http` or `proxy.unreachable`), so a model adapter passes them
 * on and the run page can say it was the proxy, not the internet. The
 * `message` is the shell's own sentence, written for the person and without
 * the proxy's user name or password; the cause's `detail` keeps it as
 * `message`, as the run page shows it.
 *
 * @example
 * new ShellProxyError("proxy", "couldn't reach the host through the proxy: check HTTPS_PROXY and the proxy", answer);
 * // failureCause: { code: "proxy.unreachable", detail: { message: "couldn't reach the host…" } }
 */
class ShellProxyError extends Error {
  /** The same stable code as the CLI's `ProxyError`. */
  readonly code = "proxy-failed";
  /** The shell's refusal kind, such as `proxy_refused`. */
  readonly refusal: ProxyRefusalKind;
  readonly problem: (typeof proxyRefusals)[ProxyRefusalKind]["problem"];
  readonly kind: (typeof proxyRefusals)[ProxyRefusalKind]["kind"];
  readonly failureCause: { readonly code: string; readonly detail: Record<string, string> };

  constructor(refusal: ProxyRefusalKind, message: string, answer: unknown) {
    super(message, { cause: answer });
    this.name = "ShellProxyError";
    this.refusal = refusal;
    this.problem = proxyRefusals[refusal].problem;
    this.kind = proxyRefusals[refusal].kind;
    this.failureCause = { code: `proxy.${this.problem}`, detail: { message } };
  }
}
