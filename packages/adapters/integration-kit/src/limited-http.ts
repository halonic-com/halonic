import type {
  HttpClient,
  IntegrationHttpClient,
  IntegrationRequestInit,
  SecretPlacement,
  Secrets,
} from "@halonicjs/ports";
import { allowedUrl, type IntegrationPolicy } from "./policy.ts";
import { IntegrationRefusedError, IntegrationTimeoutError } from "./refused.ts";
import {
  type Body,
  bodyBytes,
  checkBody,
  requestBodyLimit,
  requestTooLarge,
  toForm,
} from "./request-body.ts";
import type { RequestLog } from "./request-log.ts";
import { type BodyGuard, guardBody, untilAborted } from "./response-body.ts";
import { removeSecretsFromError, secretForms } from "./secret-filter.ts";
import { checkPlacements, place, readSecrets } from "./secret-placement.ts";

/**
 * Limits on one request. Every field has a default; the loader sets them
 * from the integration's permission sheet, so a model answer streamed for
 * minutes or a large file export can raise them.
 */
export interface RequestLimits {
  /** Waiting for the response headers, redirects included. Default 30 seconds. */
  readonly headersTimeoutMs?: number;
  /** Waiting for the next piece of the body. Default 60 seconds. */
  readonly idleTimeoutMs?: number;
  /** The whole request, reading the body included. Default 10 minutes. */
  readonly timeoutMs?: number;
  /** The response body. Default 10 MiB. */
  readonly maxResponseBytes?: number;
  /**
   * The request body, in bytes sent. Default and ceiling 720 KiB
   * (`maxRequestBodyBytes`): it can be lowered, never raised, so an
   * integration behaves the same in-process and in the fenced runner.
   */
  readonly maxRequestBodyBytes?: number;
  /** Redirects followed before the request fails. Default 5. */
  readonly maxRedirects?: number;
}

/** What {@link createLimitedHttpClient} needs. */
export interface LimitedHttpOptions {
  readonly policy: IntegrationPolicy;
  /** The real transport underneath, such as the runtime's `fetch`. */
  readonly transport: HttpClient;
  /** Where the kit reads the values of the secrets it places. */
  readonly secrets: Secrets;
  readonly log: RequestLog;
  readonly limits?: RequestLimits;
  /** Milliseconds for the request log's timings. Default `Date.now`. */
  readonly now?: () => number;
}

const redirectStatuses = new Set([301, 302, 303, 307, 308]);
/** Headers a browser drops when a redirect leaves the origin; the kit does the same. */
const originBoundHeaders = ["authorization", "cookie", "proxy-authorization"];

/**
 * The `HttpClient` an integration gets: only the hosts and secrets of its
 * permission sheet, `https` only (plain `http` only to a local host), every
 * redirect hop checked again, with timeouts and a response size limit. Every
 * request goes into the log.
 *
 * @example
 * const http = createLimitedHttpClient({ policy, transport: { fetch }, secrets, log: new RequestLog() });
 * await http.fetch("https://api.example.com/v1", { auth: { secret: "example-key", as: "bearer" } });
 */
export function createLimitedHttpClient(options: LimitedHttpOptions): IntegrationHttpClient {
  const now = options.now ?? Date.now;
  return {
    async fetch(rawUrl: string, init: IntegrationRequestInit = {}): Promise<Response> {
      const started = now();
      const method = (init.method ?? "GET").toUpperCase();
      const where = logPlace(rawUrl);
      try {
        const response = await send(options, rawUrl, init, method);
        options.log.add({
          method,
          ...logPlace(response.url),
          status: response.status,
          durationMs: now() - started,
          outcome: "ok",
        });
        return response;
      } catch (error) {
        const refused = error instanceof IntegrationRefusedError;
        options.log.add({
          method,
          ...where,
          durationMs: now() - started,
          outcome: refused ? "refused" : "failed",
          ...(refused ? { refusal: error.code } : {}),
        });
        throw error;
      }
    },
  };
}

/** The parts of a request that change from one redirect hop to the next. */
interface Hop {
  url: URL;
  method: string;
  body: Body;
  form: URLSearchParams | undefined;
  placements: readonly SecretPlacement[];
  readonly headers: Headers;
}

async function send(
  options: LimitedHttpOptions,
  rawUrl: string,
  init: IntegrationRequestInit,
  method: string,
): Promise<Response> {
  const { policy, limits = {} } = options;
  const { auth, signal, redirect: _redirect, ...rest } = init;
  const placements: readonly SecretPlacement[] = auth === undefined ? [] : [auth].flat();
  const url = allowedUrl(policy, rawUrl);
  checkPlacements(policy, placements, url);
  const body = rest.body ?? null;
  checkBody(policy, body);
  const maxBodyBytes = requestBodyLimit(limits.maxRequestBodyBytes);
  const values = await readSecrets(policy, options.secrets, placements);
  const hop: Hop = {
    url,
    method,
    body,
    form: placements.some((p) => p.as === "form") ? toForm(policy, body) : undefined,
    placements,
    headers: new Headers(rest.headers),
  };
  const deadline = new AbortController();
  const stop = (what: string, ms: number) =>
    deadline.abort(
      new IntegrationTimeoutError(
        `${policy.name}: ${what} from ${hop.url.host}${hop.url.pathname} within ${ms} ms`,
      ),
    );
  const totalMs = limits.timeoutMs ?? 600_000;
  const headersMs = limits.headersTimeoutMs ?? 30_000;
  const total = setTimeout(() => stop("no complete response", totalMs), totalMs);
  const headersTimer = setTimeout(() => stop("no response headers", headersMs), headersMs);
  const combined = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
  const maxRedirects = limits.maxRedirects ?? 5;
  const guard: BodyGuard = {
    signal: combined,
    idleMs: limits.idleTimeoutMs ?? 60_000,
    maxBytes: limits.maxResponseBytes ?? 10 * 1024 * 1024,
    onIdle: () => stop("no data", limits.idleTimeoutMs ?? 60_000),
    done: () => clearTimeout(total),
    secrets: secretForms(
      [...values].map(([secret, value]) => ({
        value,
        placements: placements.filter((placement) => placement.secret === secret),
      })),
    ),
  };

  try {
    for (let count = 0; ; count++) {
      const headers = new Headers(hop.headers);
      const placedForm = place(policy, hop.placements, values, hop.url, headers, hop.form);
      const body = placedForm ?? hop.body;
      if (bodyBytes(body) > maxBodyBytes) throw requestTooLarge(policy, hop.url, maxBodyBytes);
      const response = await untilAborted(
        options.transport.fetch(hop.url.href, {
          ...rest,
          method: hop.method,
          headers,
          body,
          redirect: "manual",
          signal: combined,
        }),
        combined,
      );
      const location = response.headers.get("location");
      if (!redirectStatuses.has(response.status) || location === null) {
        clearTimeout(headersTimer);
        return guardBody(policy, response, hop.url, guard);
      }
      await response.body?.cancel();
      if (count >= maxRedirects) {
        throw new IntegrationRefusedError(
          "too-many-redirects",
          `${policy.name}: ${hop.url.host}${hop.url.pathname} redirected more than ${maxRedirects} times`,
        );
      }
      follow(hop, response.status, allowedUrl(policy, location, hop.url));
    }
  } catch (error) {
    clearTimeout(headersTimer);
    clearTimeout(total);
    // Refusals and timeouts name the URL of the hop, which a redirect may have chosen.
    throw removeSecretsFromError(error, guard.secrets);
  }
}

/** Moves the hop on to an allowed redirect target, the way `fetch` does. */
function follow(hop: Hop, status: number, next: URL): void {
  if (next.origin !== hop.url.origin)
    for (const name of originBoundHeaders) hop.headers.delete(name);
  const toGet = status === 303 || ((status === 301 || status === 302) && hop.method === "POST");
  if (toGet) {
    hop.method = hop.method === "HEAD" ? "HEAD" : "GET";
    hop.body = null;
    hop.form = undefined;
    hop.placements = hop.placements.filter((p) => p.as !== "form");
    hop.headers.delete("content-type");
    hop.headers.delete("content-length");
  }
  hop.url = next;
}

/** Host and path for the log, without query or fragment. Empty when the URL doesn't parse. */
function logPlace(raw: unknown): { host: string; path: string } {
  try {
    const url = new URL(String(raw));
    return { host: url.host, path: url.pathname };
  } catch {
    return { host: "", path: "" };
  }
}
