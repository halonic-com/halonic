import type {
  AuthPlacement,
  HttpClient,
  IntegrationHttpClient,
  IntegrationRequestInit,
  Secrets,
  SignInTokens,
} from "@halonicjs/ports";
import { AttemptLog } from "./attempt-log.ts";
import {
  checkPlacementHosts,
  checkPlacements,
  isSecretPlacement,
  isSignInPlacement,
  place,
} from "./auth-placement.ts";
import { IntegrationRefusedError, IntegrationTimeoutError } from "./integration/index.ts";
import { copyRequest, type OwnRequest } from "./own-request.ts";
import { allowedUrl, type IntegrationPolicy } from "./policy.ts";
import { rateLimitRetryMs } from "./rate-limit-retry.ts";
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
import { removeSecretsFromError, type SecretForms, secretForms } from "./secret-filter.ts";
import {
  carriedForms,
  readDeclaredSecrets,
  refuseCarriedSecrets,
  refuseRedirectCarryingSecrets,
} from "./secret-in-request.ts";
import { readSecrets } from "./secret-placement.ts";
import { readTokens, reportRejected } from "./sign-in-placement.ts";
import { integrationWait } from "./wait.ts";

/**
 * Limits on one request. Every field has a default; the loader sets them
 * from the integration's permission sheet, so a model answer streamed for
 * minutes or a large file export can raise them.
 */
export interface RequestLimits {
  /** Waiting for the response headers, redirects included, for each attempt. Default 30 seconds. */
  readonly headersTimeoutMs?: number;
  /** Waiting for the next piece of the body. Default 60 seconds. */
  readonly idleTimeoutMs?: number;
  /** The whole request, every retry and reading the body included. Default 10 minutes. */
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
  /**
   * Where the kit gets the access token of a sign-in it places, and what it
   * tells when a server answers 401. Without it, a request that places a
   * token is refused as `sign-in-needed`.
   */
  readonly signInTokens?: SignInTokens;
  readonly log: RequestLog;
  readonly limits?: RequestLimits;
  /**
   * The clock in milliseconds, for the request log's timings and for a
   * `retry-after` date that comes without a `date` header. Default `Date.now`.
   */
  readonly now?: () => number;
}

const redirectStatuses = new Set([301, 302, 303, 307, 308]);
/** Headers a browser drops when a redirect leaves the origin; the kit does the same. */
const originBoundHeaders = ["authorization", "cookie", "proxy-authorization"];

/**
 * The `HttpClient` an integration gets: only the hosts and secrets of its
 * permission sheet, `https` only (plain `http` only to a local host), every
 * redirect hop checked again, with timeouts and a response size limit. A
 * `GET` or `HEAD` that gets `429` is sent again, at most twice. Every
 * request sent goes into the log.
 *
 * @example
 * const http = createLimitedHttpClient({ policy, transport: { fetch }, secrets, log: new RequestLog() });
 * await http.fetch("https://api.example.com/v1", { auth: { secret: "example-key", as: "bearer" } });
 */
export function createLimitedHttpClient(options: LimitedHttpOptions): IntegrationHttpClient {
  const now = options.now ?? Date.now;
  return {
    async fetch(rawUrl: string, init: IntegrationRequestInit = {}): Promise<Response> {
      const attempts = new AttemptLog(options.log, now);
      try {
        // Before the first `await`: from here on the kit reads only this copy.
        const own = copyRequest(options.policy, rawUrl, init);
        // The method, host and path may hold a key, so the secret check runs first:
        // before the URL is parsed and before any other refusal.
        // Needs no secret, so a placement the sheet doesn't allow is refused before any is read.
        checkPlacements(options.policy, own.placements);
        const declared = await readDeclaredSecrets(options.policy, options.secrets);
        const carried = carriedForms([...declared.values(), ...signInValues(options)]);
        refuseCarriedSecrets(options.policy, carried, {
          method: own.givenMethod,
          sentMethod: own.method,
          url: own.url ?? "",
          headers: own.headers,
          body: own.body,
        });
        attempts.checked(own.method, own.url);
        return await send({ ...options, now }, own, { declared, carried }, attempts);
      } catch (error) {
        attempts.failed(error);
        throw error;
      }
    },
  };
}

/** Every value the sign-ins' tokens say the filter must remove: tokens not yet expired, refresh tokens, client secrets. */
function signInValues(options: LimitedHttpOptions): readonly string[] {
  return options.signInTokens?.filterValues() ?? [];
}

/** The declared secret values, read once per request, and their forms for the carried check. */
interface DeclaredSecrets {
  readonly declared: ReadonlyMap<string, string>;
  readonly carried: SecretForms;
}

/** The parts of a request that change from one redirect hop to the next. */
interface Hop {
  url: URL;
  method: string;
  body: Body;
  form: URLSearchParams | undefined;
  placements: readonly AuthPlacement[];
  readonly headers: Headers;
}

async function send(
  options: LimitedHttpOptions & { readonly now: () => number },
  own: OwnRequest,
  { declared, carried }: DeclaredSecrets,
  attempts: AttemptLog,
): Promise<Response> {
  const { policy, limits = {} } = options;
  // Only the copied method, headers and body reach the transport, which the secret check has
  // read. Every other option is dropped: `referrer` goes out as an unchecked `Referer` header,
  // and Node's `dispatcher` would hand the whole request, placed secrets included, to the
  // integration.
  const { placements, body, signal } = own;
  // After the secret check, which skips a body it can't read, so this refusal logs no key.
  checkBody(policy, body);
  const url = allowedUrl(policy, own.url);
  checkPlacementHosts(policy, placements, url);
  const maxBodyBytes = requestBodyLimit(limits.maxRequestBodyBytes);
  const values = await readSecrets(policy, options.secrets, placements);
  const form = placements.some((p) => p.as === "form") ? toForm(policy, body) : undefined;
  // Each attempt starts from the request as given, never from where a redirect took the last one.
  const firstHop = (): Hop => ({
    url,
    method: own.method,
    body,
    form,
    placements,
    headers: new Headers(own.headers),
  });
  let hop = firstHop();
  const timers = startTimers(policy, () => hop.url, limits, signal);
  // Every declared secret, not only the placed ones: the bridge filters the same way.
  const guard = bodyGuard(limits, timers, filterForms(options, placements, declared, new Map()));
  try {
    for (let retry = 1, waitedMs = 0; ; retry++) {
      timers.startHeaders();
      const context = { hop, values, declared, carried, guard, maxBodyBytes, timers };
      const response = await followHops(options, context);
      timers.stopHeaders();
      attempts.answered(response.status, hop.url);
      const waitMs = rateLimitRetryMs(own.method, response, retry, waitedMs, options.now());
      if (waitMs === undefined) return guardBody(policy, response, hop.url, guard);
      // So the connection isn't held during the wait.
      await response.body?.cancel();
      await integrationWait(waitMs, timers.combined);
      waitedMs += waitMs;
      hop = firstHop();
      attempts.retrying();
    }
  } catch (error) {
    timers.stopHeaders();
    clearTimeout(timers.total);
    // Refusals and timeouts name the URL of the hop, which a redirect may have chosen.
    throw removeSecretsFromError(error, guard.secrets);
  }
}

/** The limits on reading the body of the answer the integration gets. */
function bodyGuard(limits: RequestLimits, timers: Timers, secrets: SecretForms): BodyGuard {
  const idleMs = limits.idleTimeoutMs ?? 60_000;
  return {
    signal: timers.combined,
    idleMs,
    maxBytes: limits.maxResponseBytes ?? 10 * 1024 * 1024,
    onIdle: () => timers.stop("no data", idleMs),
    done: () => clearTimeout(timers.total),
    secrets,
  };
}

/** The request's deadlines: one signal for both, and the timers to clear. */
interface Timers {
  readonly combined: AbortSignal;
  /** Covers every attempt and the waits between them; it isn't restarted for a retry. */
  readonly total: ReturnType<typeof setTimeout>;
  /** Starts waiting for one attempt's response headers. */
  readonly startHeaders: () => void;
  /** The headers came, or the attempt ended. */
  readonly stopHeaders: () => void;
  readonly stop: (what: string, ms: number) => void;
}

function startTimers(
  policy: IntegrationPolicy,
  hopUrl: () => URL,
  limits: RequestLimits,
  signal: AbortSignal | undefined,
): Timers {
  const deadline = new AbortController();
  const stop = (what: string, ms: number) => {
    const { host, pathname } = hopUrl();
    deadline.abort(
      new IntegrationTimeoutError(
        `${policy.name}: ${what} from ${host}${pathname} within ${ms} ms`,
      ),
    );
  };
  const totalMs = limits.timeoutMs ?? 600_000;
  const headersMs = limits.headersTimeoutMs ?? 30_000;
  let headers: ReturnType<typeof setTimeout> | undefined;
  return {
    combined: signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal,
    total: setTimeout(() => stop("no complete response", totalMs), totalMs),
    startHeaders: () => {
      headers = setTimeout(() => stop("no response headers", headersMs), headersMs);
    },
    stopHeaders: () => clearTimeout(headers),
    stop,
  };
}

/** What {@link followHops} needs besides the request itself. */
interface HopContext {
  readonly hop: Hop;
  /** The secrets this request places. */
  readonly values: Awaited<ReturnType<typeof readSecrets>>;
  /** Every declared secret, placed or not: the filter and the redirect check cover all of them. */
  readonly declared: ReadonlyMap<string, string>;
  /** Replaced when a hop brings in a token the kit hadn't seen. */
  carried: SecretForms;
  readonly guard: BodyGuard;
  readonly maxBodyBytes: number;
  readonly timers: Timers;
}

/**
 * Every form of the values that must not reach the integration or leave in
 * its own requests: the declared secrets (with where this request places
 * them), the sign-ins' filter values, and the tokens this hop places.
 */
function filterForms(
  options: LimitedHttpOptions,
  placements: readonly AuthPlacement[],
  declared: ReadonlyMap<string, string>,
  tokens: ReadonlyMap<string, string>,
): SecretForms {
  const placedAs = (name: string, isPlaced: (placement: AuthPlacement) => boolean) =>
    placements.filter((placement) => isPlaced(placement) && placementName(placement) === name);
  return secretForms([
    ...[...declared].map(([secret, value]) => ({
      value,
      placements: placedAs(secret, isSecretPlacement),
    })),
    ...signInValues(options).map((value) => ({ value })),
    ...[...tokens].map(([signIn, value]) => ({
      value,
      placements: placedAs(signIn, isSignInPlacement),
    })),
  ]);
}

/** The name of the secret or sign-in a placement is for. */
function placementName(placement: AuthPlacement): string {
  return isSecretPlacement(placement) ? placement.secret : placement.signIn;
}

/**
 * Sends one attempt of the request, then each redirect hop, until an answer
 * that isn't one. The answer comes back as the transport gave it, its body
 * not yet guarded.
 */
async function followHops(options: LimitedHttpOptions, context: HopContext): Promise<Response> {
  const { policy, limits = {} } = options;
  const { hop, values, declared, guard, maxBodyBytes, timers } = context;
  const maxRedirects = limits.maxRedirects ?? 5;
  for (let count = 0; ; count++) {
    const tokens = await readTokens(
      policy,
      options.signInTokens,
      hop.placements.filter(isSignInPlacement),
      hop.url,
      timers.combined,
    );
    if (hop.placements.some(isSignInPlacement)) {
      // A refresh may have issued a token the filter didn't know when the request started.
      guard.secrets = filterForms(options, hop.placements, declared, tokens);
      context.carried = carriedForms([...declared.values(), ...signInValues(options)]);
    }
    const headers = new Headers(hop.headers);
    const placedForm = place(
      policy,
      hop.placements,
      { secrets: values, tokens },
      hop.url,
      headers,
      hop.form,
    );
    const body = placedForm ?? hop.body;
    if (bodyBytes(body) > maxBodyBytes) throw requestTooLarge(policy, hop.url, maxBodyBytes);
    const response = await untilAborted(
      options.transport.fetch(hop.url.href, {
        method: hop.method,
        headers,
        body,
        redirect: "manual",
        signal: timers.combined,
      }),
      timers.combined,
    );
    // Only for a token this hop placed: a 401 from any other hop says nothing about it.
    if (response.status === 401) reportRejected(options.signInTokens, tokens);
    const location = response.headers.get("location");
    if (!redirectStatuses.has(response.status) || location === null) return response;
    await response.body?.cancel();
    if (count >= maxRedirects) {
      throw new IntegrationRefusedError(
        "too-many-redirects",
        `${policy.name}: ${hop.url.host}${hop.url.pathname} redirected more than ${maxRedirects} times`,
      );
    }
    refuseRedirectCarryingSecrets(policy, context.carried, location, hop.url);
    follow(hop, response.status, allowedUrl(policy, location, hop.url));
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
