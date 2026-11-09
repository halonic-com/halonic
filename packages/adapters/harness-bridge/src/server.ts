import type {
  HarnessBridgeOptions,
  HarnessBridgeServer,
  OpenHarnessBridge,
  Secrets,
} from "@halonicjs/ports";
import { anthropicRoute } from "./anthropic-route.ts";
import { openBridge } from "./bridge.ts";
import type { Fetch, UpstreamLimits } from "./pass-through.ts";
import type { BodyLimits } from "./read-body.ts";
import type { BridgeRoute } from "./route.ts";

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

/** How to set up {@link NodeHarnessBridgeServer}. */
export interface NodeHarnessBridgeServerOptions {
  /** Where the bridge reads the provider keys an agent's `providers` name. */
  secrets: Secrets;
  /** Size and time limits for a request; each one left out keeps its default. */
  limits?: Partial<BodyLimits>;
  /** How long to wait for a provider; each one left out keeps its default. */
  upstreamLimits?: Partial<UpstreamLimits>;
  /** Calls the providers; Node's own `fetch` unless a test gives another. */
  fetch?: Fetch;
}

/**
 * The `HarnessBridgeServer` port on Node's own `http` server: one server per
 * run, on a free port of `127.0.0.1`, answering only requests that carry the
 * run's token (requirement `harness-bridge.server`).
 *
 * @example
 * const server = new NodeHarnessBridgeServer({ secrets });
 * const bridge = await server.open({ runId, agentId, providers, price, recorder, tools, approvals });
 * try {
 *   await runHarness(bridge);
 * } finally {
 *   await bridge.close();
 * }
 */
export class NodeHarnessBridgeServer implements HarnessBridgeServer {
  readonly #limits: BodyLimits;
  readonly #routes: readonly BridgeRoute[];

  constructor(options: NodeHarnessBridgeServerOptions) {
    this.#limits = { ...defaultBridgeLimits, ...options.limits };
    const upstream = {
      fetch: options.fetch ?? globalThis.fetch,
      limits: { ...defaultUpstreamLimits, ...options.upstreamLimits },
    };
    // OpenAI and the MCP endpoint come with later steps of the build plan.
    this.#routes = [anthropicRoute({ secrets: options.secrets, ...upstream })];
  }

  /** Starts serving one run. */
  open(options: HarnessBridgeOptions): Promise<OpenHarnessBridge> {
    return openBridge(options, { limits: this.#limits, routes: this.#routes });
  }
}
