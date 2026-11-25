// The paths every bridge serves and the limits it uses unless given others,
// for the Node server and the Worker alike. Web-standard APIs only.

import type { Secrets } from "@halonicjs/ports";
import { anthropicRoute } from "./anthropic-route.ts";
import { mcpRoutes } from "./mcp-route.ts";
import { openAiRoute } from "./openai-route.ts";
import type { Fetch, UpstreamLimits } from "./pass-through.ts";
import type { BridgeRoute } from "./route.ts";
import type { BodyLimits } from "./web-body.ts";

/** The limits a bridge uses unless it is given others. */
export const defaultBridgeLimits: Readonly<BodyLimits> = Object.freeze({
  // Model requests carry the whole conversation, images and PDFs included, so they can be large.
  maxBytes: 32 * 1024 * 1024,
  timeoutMs: 60_000,
});

/** How long a bridge waits for a provider unless it is given other limits. */
export const defaultUpstreamLimits: Readonly<UpstreamLimits> = Object.freeze({
  // Anthropic allows a reply that doesn't stream up to ten minutes.
  responseTimeoutMs: 10 * 60_000,
  // A streaming reply sends events, pings included, well within this.
  idleTimeoutMs: 2 * 60_000,
});

/** What the bridge's routes need to reach the providers. */
export interface BridgeRoutesOptions {
  /** Where the bridge reads the provider keys an agent's `providers` name. */
  secrets: Secrets;
  /** Calls the providers: the `fetch` of an `HttpClient` that may reach their hosts and no others. */
  fetch: Fetch;
  /** Calls a compatible provider at the `baseUrl` a keyed access names; left out, those calls are refused. */
  compatibleFetch?: Fetch;
  /** How long to wait for a provider; each one left out keeps its default. */
  upstreamLimits?: Partial<UpstreamLimits>;
}

/** The bridge's routes: Anthropic, OpenAI and Halonic's MCP endpoint. */
export function bridgeRoutes(options: BridgeRoutesOptions): readonly BridgeRoute[] {
  const upstream = {
    fetch: options.fetch,
    compatibleFetch: options.compatibleFetch,
    limits: { ...defaultUpstreamLimits, ...options.upstreamLimits },
  };
  return [
    anthropicRoute({ secrets: options.secrets, ...upstream }),
    openAiRoute({ secrets: options.secrets, ...upstream }),
    ...mcpRoutes(),
  ];
}
