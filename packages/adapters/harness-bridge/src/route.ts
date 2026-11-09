import type { IncomingMessage, ServerResponse } from "node:http";
import type { HarnessBridgeOptions } from "@halonicjs/ports";

/** What a route gets for one request the bridge has already let in. */
export interface BridgeRequestContext {
  /** What the engine gave the bridge of this run. */
  run: HarnessBridgeOptions;
  request: IncomingMessage;
  response: ServerResponse;
  /** Reads the body within the bridge's size and time limits. */
  readBody(): Promise<Uint8Array>;
  /** Aborts when the program goes away or the bridge closes; pass it to every call out. */
  signal: AbortSignal;
}

/**
 * One path the bridge serves, such as Anthropic's `POST /v1/messages`. The
 * bridge has checked the run token before a route sees a request. A route
 * that throws before it starts its reply gets the bridge's error reply.
 */
export interface BridgeRoute {
  method: "GET" | "POST";
  /** The exact path, without the query. */
  path: string;
  handle(context: BridgeRequestContext): Promise<void>;
}
