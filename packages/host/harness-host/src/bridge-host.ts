// The engine's bridge host on the `HarnessBridgeServer` port (requirement
// `harness-host.bridge`). The engine gives the run, the agent and where the
// bridge's events go; the host's `servicesFor` gives what the bridge serves
// that agent. Same shape as the Studio's `AgentHostBridges`, so one
// `servicesFor` serves either.

import type { HarnessAgent, HarnessBridgeHost } from "@halonicjs/engine";
import type {
  BridgeApprovals,
  BridgeProvider,
  BridgeProviderAccess,
  BridgeRecorder,
  BridgeTools,
  HarnessBridgeServer,
  ModelPrice,
  OpenHarnessBridge,
} from "@halonicjs/ports";

/** The agent a bridge serves; the engine's `HarnessAgent` has these and more. */
export interface BridgeAgent {
  readonly runId: string;
  readonly agentId: string;
}

/**
 * What the host serves one agent's bridge. No keys: the bridge server
 * reads them itself, so they never pass through here.
 */
export interface BridgeServices {
  /** The providers the agent may reach and how it signs in. A provider not named is refused. */
  readonly providers: Partial<Record<BridgeProvider, BridgeProviderAccess>>;
  /** Each provider's models with a price; a model not named has none. */
  readonly prices: Partial<Record<BridgeProvider, Readonly<Record<string, ModelPrice>>>>;
  readonly tools: BridgeTools;
  readonly approvals: BridgeApprovals;
}

/** Gives the services of each agent's bridge. */
export interface BridgeServicesSource {
  servicesFor(agent: BridgeAgent): BridgeServices | Promise<BridgeServices>;
}

/**
 * Opens each harness run's bridge on this computer, with the services the
 * host gives for its agent.
 *
 * @example
 * const bridges = new LocalBridgeHost({ server, services });
 * const bridge = await bridges.open(agent, recorder);
 */
export class LocalBridgeHost implements HarnessBridgeHost {
  readonly #server: HarnessBridgeServer;
  readonly #services: BridgeServicesSource;

  constructor(options: { server: HarnessBridgeServer; services: BridgeServicesSource }) {
    this.#server = options.server;
    this.#services = options.services;
  }

  /** @throws what `servicesFor` throws, or the server's `open` when it can't listen */
  async open(agent: HarnessAgent, recorder: BridgeRecorder): Promise<OpenHarnessBridge> {
    const services = await this.#services.servicesFor({
      runId: agent.runId,
      agentId: agent.agentId,
    });
    return await this.#server.open({
      runId: agent.runId,
      agentId: agent.agentId,
      providers: services.providers,
      price: (provider, model) => priceOf(services.prices, provider, model),
      recorder,
      tools: services.tools,
      approvals: services.approvals,
    });
  }
}

/**
 * A model's price, or `null` when the provider names none for it. Only the
 * prices' own entries count, so a model the program names "toString" has no
 * price rather than one from `Object.prototype`.
 */
function priceOf(
  prices: BridgeServices["prices"],
  provider: BridgeProvider,
  model: string,
): ModelPrice | null {
  const models = Object.hasOwn(prices, provider) ? prices[provider] : undefined;
  if (models === undefined || !Object.hasOwn(models, model)) return null;
  return models[model] ?? null;
}
