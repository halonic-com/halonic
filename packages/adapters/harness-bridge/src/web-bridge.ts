// The bridge for a runtime without Node, such as the Cloudflare Worker: it
// answers a Web `Request` with a Web `Response`, through the same routes,
// budget checks and spend records as the Node bridge. Web-standard APIs only.

import { type HarnessBridgeOptions, harnessBridgeTokenHeader } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { bridgeErrorReply, bridgeRefusalReply } from "./bridge-error.ts";
import { type BridgeRoutesOptions, bridgeRoutes, defaultBridgeLimits } from "./bridge-routes.ts";
import { reportFailure, reportUnnamedFailure } from "./failure-report.ts";
import { refusals } from "./request-checks.ts";
import type { BridgeRoute } from "./route.ts";
import type { RunCredentialBinding, RunCredentials } from "./run-credential.ts";
import { type BodyLimits, bodyTooLarge, readWebBody } from "./web-body.ts";

/** How to set up a {@link WebHarnessBridge}. */
export interface WebHarnessBridgeOptions<Binding extends RunCredentialBinding>
  extends BridgeRoutesOptions {
  /** The runs' credentials: a request gets in only with its run's. */
  credentials: RunCredentials<Binding>;
  /** Size and time limits for a request; each one left out keeps its default. */
  limits?: Partial<BodyLimits>;
}

/** What the Worker gives {@link WebHarnessBridge.handle} besides the request. */
export interface WebBridgeExchange {
  /**
   * The run the request reached, as the Worker routed it: never one the
   * request names. Its credential is checked under `run.runId`.
   */
  run: HarnessBridgeOptions;
  /**
   * Keeps the Worker alive for work that goes on after the reply, such as
   * recording a call's spend once its streamed reply ends: the Worker's
   * `ctx.waitUntil`. The work given here never rejects.
   */
  waitUntil(work: Promise<void>): void;
}

/**
 * The bridge on a Web runtime (requirement `harness-bridge.web`). A request
 * gets in only when it has no `Origin` header (or the answer is 403) and
 * carries its run's credential in {@link harnessBridgeTokenHeader} (or the
 * answer is 401, whatever the path). It then gets the same routes as on Node.
 *
 * @example
 * const bridge = new WebHarnessBridge({ secrets, fetch, credentials });
 * return bridge.handle(request, { run, waitUntil: (work) => ctx.waitUntil(work) });
 */
export class WebHarnessBridge<Binding extends RunCredentialBinding> {
  readonly #credentials: RunCredentials<Binding>;
  readonly #limits: BodyLimits;
  readonly #routes: readonly BridgeRoute[];

  constructor(options: WebHarnessBridgeOptions<Binding>) {
    this.#credentials = options.credentials;
    this.#limits = { ...defaultBridgeLimits, ...options.limits };
    this.#routes = bridgeRoutes(options);
  }

  /** Answers one request for `exchange.run`. It never throws: a failure is the bridge's error reply. */
  async handle(request: Request, exchange: WebBridgeExchange): Promise<Response> {
    if (request.headers.has("origin")) return bridgeRefusalReply(refusals.browserOrigin);
    const { run } = exchange;
    const sent = request.headers.get(harnessBridgeTokenHeader);
    const check = await this.#credentials.check(run.runId, sent);
    if (!check.ok || sent === null) {
      return bridgeErrorReply(
        new KindedError(
          "unauthenticated",
          "The request doesn't carry this run's bridge credential.",
        ),
      );
    }
    try {
      const reply = await this.#answer(request, exchange, sent);
      return withReportedBody(reply, (error) => reportUnnamedFailure(run, sent, error));
    } catch (error) {
      reportUnnamedFailure(run, sent, error);
      return bridgeErrorReply(error);
    }
  }

  async #answer(request: Request, exchange: WebBridgeExchange, credential: string) {
    const { run } = exchange;
    const path = new URL(request.url).pathname;
    const route = this.#routes.find((each) => each.method === request.method && each.path === path);
    if (route === undefined) {
      throw new KindedError("not_found", "The Halonic bridge doesn't serve this path.");
    }
    if (Number(request.headers.get("content-length") ?? 0) > this.#limits.maxBytes) {
      throw bodyTooLarge(this.#limits);
    }
    // A body can be read only once, so a second call gets the same read.
    let body: Promise<Uint8Array> | undefined;
    const readBody = () => {
      body ??= readWebBody(request.body, this.#limits);
      return body;
    };
    const signals = run.signal === undefined ? [request.signal] : [request.signal, run.signal];
    return route.handle({
      run,
      request,
      readBody,
      signal: AbortSignal.any(signals),
      reportError: (error) => reportFailure(run, credential, error),
      afterReply: (work) =>
        exchange.waitUntil(
          work.catch((error: unknown) => reportUnnamedFailure(run, credential, error)),
        ),
    });
  }
}

/**
 * The reply with a body that tells the run when it fails part way: the
 * program only sees the reply cut off, so the run log must hold why.
 */
function withReportedBody(reply: Response, report: (error: unknown) => void): Response {
  if (reply.body === null) return reply;
  const reader = reply.body.getReader();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (error) {
        report(error);
        controller.error(error);
      }
    },
    cancel: (reason) => reader.cancel(reason),
  });
  return new Response(body, { status: reply.status, headers: reply.headers });
}
