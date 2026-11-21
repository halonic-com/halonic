import { providerHostClass } from "@halonicjs/adapter-harness-bridge";
import { connectorHostClass } from "@halonicjs/adapter-http-kit";
import { createNodeHttpClient, type ProxyFromEnv } from "@halonicjs/adapter-http-node";

/** A `fetch` that goes through one of the host's address-checking clients. */
type CheckedFetch = (url: string, init?: RequestInit) => Promise<Response>;

/** The two clients a bridge in the agent host reaches model providers with. */
export interface BridgeProviderFetches {
  /** Reaches Anthropic's and OpenAI's own hosts, and nothing else. */
  readonly fetch: CheckedFetch;
  /**
   * Reaches a compatible provider's own `baseUrl`, checked as a connector's
   * address is, and never one of Halonic's own ports
   * (requirement `agent-host.compatible-provider-client`).
   */
  readonly compatibleFetch: CheckedFetch;
}

/**
 * Builds the clients the host's bridges call providers with.
 *
 * A compatible provider's own `baseUrl` is checked as a connector's address
 * is, as in the CLI's bridge, so a name can't lead the key onto the person's
 * own network (HAL-13798). That check lets a `baseUrl` on this computer
 * through, so the client also refuses the host's own ports: otherwise a
 * provider file could send the key, and the agent's requests, to the host's
 * routes or to another bridge (HAL-15016).
 *
 * @param ownPorts - the ports the host and its bridges listen on, read on every request
 * @param proxy - the company proxy for public `https` hosts
 * @example
 * const fetches = bridgeProviderFetches(() => [...listeningPorts, ...bridges.ports()], proxySetting);
 * new NodeHarnessBridgeServer({ secrets, fetch: fetches.fetch, compatibleFetch: fetches.compatibleFetch });
 */
export function bridgeProviderFetches(
  ownPorts: () => Iterable<number>,
  proxy: ProxyFromEnv | undefined,
): BridgeProviderFetches {
  const providerHttp = createNodeHttpClient({
    hostClass: providerHostClass,
    ...(proxy === undefined ? {} : { proxy }),
  });
  const compatibleHttp = createNodeHttpClient({
    hostClass: connectorHostClass,
    ownPorts,
    ...(proxy === undefined ? {} : { proxy }),
  });
  return {
    fetch: (url, init) => providerHttp.fetch(url, init),
    compatibleFetch: (url, init) => compatibleHttp.fetch(url, init),
  };
}
