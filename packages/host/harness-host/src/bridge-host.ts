// The engine's bridge host on the `HarnessBridgeServer` port (requirement
// `harness-host.bridge`). The engine gives the run, the agent and where the
// bridge's events go; the host's `servicesFor` gives what the bridge serves
// that agent. Same shape as the Studio's `AgentHostBridges`, so one
// `servicesFor` serves either.

import type {
  HarnessAgent,
  HarnessBridgeHost,
  HostedHarnessBridge,
  Placement,
  ProgramHarness,
} from "@halonicjs/engine";
import type {
  BridgeApprovals,
  BridgeProvider,
  BridgeProviderAccess,
  BridgeRecorder,
  BridgeTools,
  HarnessBridgeServer,
  ModelPrice,
} from "@halonicjs/ports";

/** The agent a bridge serves; the engine's `HarnessAgent` has these and more. */
export interface BridgeAgent {
  readonly runId: string;
  readonly agentId: string;
  /**
   * The harness the agent's call runs in, so a host that resolves its model
   * gives only a provider that harness's program can speak.
   */
  readonly harness: ProgramHarness;
  /** The hub whose workspace the agent's file is in, where the host resolves its model. */
  readonly hubId?: string;
  /**
   * The agent file's `model` as written, before any mapping: a `models.yaml`
   * alias, `provider/model`, or a name the program knows. The host resolves
   * an alias to choose the provider's access; `undefined` when the file names none.
   */
  readonly model?: string;
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
 * The bridge server for each placement (requirement
 * `harness-host.bridge-placement`): the fenced sandbox's may serve a Unix
 * socket its proxy reaches, while the launcher's unfenced program has no
 * proxy, so its server serves loopback only.
 */
export type BridgeServers = Readonly<Record<Placement, HarnessBridgeServer>>;

/**
 * Opens each harness run's bridge on this computer, on the server for the
 * run's placement, with the services the host gives for its agent.
 *
 * A request the bridge failed without naming the reason to the program goes
 * to the run log as a `bridge.failed`, and to `reportError` when the run log
 * can't take it.
 *
 * @example
 * const bridges = new LocalBridgeHost({
 *   servers: { sandbox: onSocket, "this-computer": onLoopback },
 *   services,
 *   reportError,
 * });
 * const bridge = await bridges.open(agent, recorder, "sandbox");
 */
export class LocalBridgeHost implements HarnessBridgeHost {
  readonly #servers: BridgeServers;
  readonly #services: BridgeServicesSource;
  readonly #reportError: (error: unknown) => void;

  /**
   * @param options.reportError - hears of a bridge failure the run log couldn't record; it must not throw
   */
  constructor(options: {
    servers: BridgeServers;
    services: BridgeServicesSource;
    reportError: (error: unknown) => void;
  }) {
    this.#servers = options.servers;
    this.#services = options.services;
    this.#reportError = options.reportError;
  }

  /** @throws what `servicesFor` throws, or the server's `open` when it can't listen */
  async open(
    agent: HarnessAgent,
    recorder: BridgeRecorder,
    runsOn: Placement,
  ): Promise<HostedHarnessBridge> {
    const services = await this.#services.servicesFor({
      runId: agent.runId,
      agentId: agent.agentId,
      harness: agent.harness,
      hubId: agent.hubId,
      ...(agent.file.model === undefined ? {} : { model: agent.file.model }),
    });
    const bridge = await this.#servers[runsOn].open({
      runId: agent.runId,
      agentId: agent.agentId,
      providers: services.providers,
      price: (provider, model) => priceOf(services.prices, provider, model),
      recorder,
      tools: services.tools,
      approvals: services.approvals,
      reportError: (failure) => this.#recordFailure(recorder, agent.agentId, failure),
    });
    const { url, token, socketPath } = bridge;
    return {
      url,
      token,
      ...(socketPath === undefined ? {} : { socketPath }),
      close: () => bridge.close(),
      providers: services.providers,
    };
  }

  /**
   * Writes a failure the bridge told the program the run log has the details
   * of, as a `bridge.failed` (requirement `harness-host.bridge-failures`).
   * The bridge's hook must not throw and can't wait, so a record that fails
   * goes to `reportError` rather than back to the bridge.
   */
  #recordFailure(
    recorder: BridgeRecorder,
    agentId: string,
    failure: { kind: string; message: string },
  ): void {
    const reportLost = (error: unknown) => {
      this.#reportError(
        new Error(
          `The run log couldn't record a failure of the harness bridge (${failure.kind}): ${failure.message}`,
          { cause: error },
        ),
      );
    };
    try {
      recorder
        .record({
          type: "bridge.failed",
          agent: agentId,
          kind: failure.kind,
          message: failure.message,
        })
        .catch(reportLost);
    } catch (error) {
      reportLost(error);
    }
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
