import type { IntegrationPolicy } from "./policy.ts";
import { IntegrationRefusedError } from "./refused.ts";
import {
  removeSecrets,
  removeSecretsFromError,
  removeSecretsFromHeaders,
  type SecretForms,
  SecretRemover,
} from "./secret-filter.ts";

/** What {@link guardBody} enforces while the integration reads the body. */
export interface BodyGuard {
  /** The caller's signal and the request's deadlines. */
  readonly signal: AbortSignal;
  readonly idleMs: number;
  readonly maxBytes: number;
  /** Ends the request because the body stalled. */
  readonly onIdle: () => void;
  /** Called once when the body is finished, failed or cancelled. */
  readonly done: () => void;
  /** The secrets of this request, removed from the status text, the headers, the URL, the body and its errors. */
  readonly secrets: SecretForms;
}

/**
 * Passes the body through with the request's secrets removed, failing it when it grows over the size limit, when no data comes
 * for the idle time while the integration is waiting, or when the request
 * is aborted. Time the integration spends between reads doesn't count.
 */
export function guardBody(
  policy: IntegrationPolicy,
  response: Response,
  url: URL,
  guard: BodyGuard,
): Response {
  const tooLarge = () =>
    new IntegrationRefusedError(
      "response-too-large",
      `${policy.name}: the response from ${url.host}${url.pathname} is larger than ${guard.maxBytes} bytes`,
    );
  const declared = Number(response.headers.get("content-length") ?? Number.NaN);
  if (Number.isFinite(declared) && declared > guard.maxBytes) {
    guard.done();
    void response.body?.cancel();
    throw removeSecretsFromError(tooLarge(), guard.secrets);
  }
  const status = statusOf(response, guard.secrets);
  const headers = removeSecretsFromHeaders(response.headers, guard.secrets);
  const finalUrl = removeSecrets(url.href, guard.secrets);
  if (response.body === null) {
    guard.done();
    return withUrl(new Response(null, { ...status, headers }), finalUrl);
  }
  // Removing a secret changes the length. The body is filtered as the
  // transport hands it over: `fetch` has already undone the content coding.
  if (guard.secrets.longest > 0) headers.delete("content-length");

  const reader = response.body.getReader();
  const remover = new SecretRemover(guard.secrets);
  let seen = 0;
  const fail = (error: unknown) => {
    guard.done();
    reader.cancel(error).catch(() => {});
    throw error;
  };
  /** The next piece from the transport, within the idle time. */
  const read = async () => {
    const idle = setTimeout(guard.onIdle, guard.idleMs);
    try {
      return await untilAborted(reader.read(), guard.signal);
    } finally {
      clearTimeout(idle);
    }
  };
  const guarded = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        // A piece can be held back whole while the filter waits for the
        // rest of a possible secret, so read until there is something to pass on.
        for (;;) {
          const next = await read();
          if (next.done) {
            guard.done();
            const rest = remover.flush();
            if (rest.length > 0) controller.enqueue(rest);
            controller.close();
            return;
          }
          seen += next.value.byteLength;
          if (seen > guard.maxBytes) throw tooLarge();
          const filtered = remover.push(next.value);
          if (filtered.length > 0) {
            controller.enqueue(filtered);
            return;
          }
        }
      } catch (error) {
        // The size limit and the deadlines name the URL, which a redirect may have chosen.
        fail(removeSecretsFromError(error, guard.secrets));
      }
    },
    cancel(reason) {
      guard.done();
      return reader.cancel(reason);
    },
  });
  return withUrl(new Response(guarded, { ...status, headers }), finalUrl);
}

/** The status, with the secrets removed from the reason phrase, which the server writes. */
function statusOf(response: Response, secrets: SecretForms): ResponseInit {
  return { status: response.status, statusText: removeSecrets(response.statusText, secrets) };
}

/** Settles like the promise, or rejects as soon as the signal aborts, whatever the transport does. */
export function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      promise.catch(() => {});
      reject(signal.reason);
      return;
    }
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

/** Gives the response the URL of the hop that answered, as `fetch` does. */
function withUrl(target: Response, href: string): Response {
  Object.defineProperty(target, "url", { value: href });
  return target;
}
