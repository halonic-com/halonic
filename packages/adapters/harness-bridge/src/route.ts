import type { HarnessBridgeOptions } from "@halonicjs/ports";

/**
 * What a route gets for one request the bridge has already let in. It holds
 * only Web-standard types, so the same routes can serve the Node listener
 * and a runtime without Node, such as the Cloudflare Worker.
 */
export interface BridgeRequestContext {
  /** What the engine gave the bridge of this run. */
  run: HarnessBridgeOptions;
  /**
   * The request's method, address and headers. Its body is read only
   * through {@link readBody}, never through `request.body`.
   */
  request: Request;
  /** Reads the body within the bridge's size and time limits. */
  readBody(): Promise<Uint8Array>;
  /** Aborts when the program goes away or the bridge closes; pass it to every call out. */
  signal: AbortSignal;
  /**
   * Tells the run about a failure the route answered itself without its
   * cause, such as an MCP internal error, leaving out the run token. A failure
   * the route throws needs none: the bridge reports that one. It never throws.
   */
  reportError(error: unknown): void;
  /**
   * Hands the bridge work that goes on after the reply has started, such as
   * recording a call's spend once its streamed reply ends. The bridge waits
   * for it before the run counts as finished, and reports it if it fails.
   */
  afterReply(work: Promise<void>): void;
}

/**
 * One path the bridge serves, such as Anthropic's `POST /v1/messages`. The
 * bridge has checked the run token before a route sees a request. A route
 * that throws gets the bridge's error reply. A reply whose body fails part
 * way is cut off, and the bridge reports the failure to the run.
 */
export interface BridgeRoute {
  method: "GET" | "POST";
  /** The exact path, without the query. */
  path: string;
  handle(context: BridgeRequestContext): Promise<Response>;
}
