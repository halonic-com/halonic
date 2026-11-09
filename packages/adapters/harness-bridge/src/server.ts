import type {
  HarnessBridgeOptions,
  HarnessBridgeServer,
  OpenHarnessBridge,
} from "@halonicjs/ports";
import { openBridge } from "./bridge.ts";
import type { BodyLimits } from "./read-body.ts";

/** The limits a bridge uses unless it is given others. */
export const defaultBridgeLimits: BodyLimits = {
  // Model requests carry the whole conversation, images and PDFs included, so they can be large.
  maxBytes: 32 * 1024 * 1024,
  timeoutMs: 60_000,
};

/** How to set up {@link NodeHarnessBridgeServer}. */
export interface NodeHarnessBridgeServerOptions {
  /** Size and time limits for a request; each one left out keeps its default. */
  limits?: Partial<BodyLimits>;
}

/**
 * The `HarnessBridgeServer` port on Node's own `http` server: one server per
 * run, on a free port of `127.0.0.1`, answering only requests that carry the
 * run's token (requirement `harness-bridge.server`).
 *
 * @example
 * const server = new NodeHarnessBridgeServer();
 * const bridge = await server.open({ runId, agentId, providers, price, recorder, tools, approvals });
 * try {
 *   await runHarness(bridge);
 * } finally {
 *   await bridge.close();
 * }
 */
export class NodeHarnessBridgeServer implements HarnessBridgeServer {
  readonly #limits: BodyLimits;

  constructor(options: NodeHarnessBridgeServerOptions = {}) {
    this.#limits = { ...defaultBridgeLimits, ...options.limits };
  }

  /** Starts serving one run. */
  open(options: HarnessBridgeOptions): Promise<OpenHarnessBridge> {
    // The model gateway and MCP routes come with the next pull requests of this stack.
    return openBridge(options, { limits: this.#limits, routes: [] });
  }
}
