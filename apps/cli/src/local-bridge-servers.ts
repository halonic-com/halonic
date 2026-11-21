// The CLI's Node bridge servers by placement (HAL-13090), and the clients
// they call model providers with. A provider's own `baseUrl` is checked as a
// connector's address is, which lets an address on this computer through, so
// that client also refuses Halonic's own ports: every open bridge's and
// `serve`'s. Otherwise a provider file with `http://127.0.0.1:<port>` could
// send the key, and the agent's requests, to another run's bridge or to
// `serve` (HAL-15251), as the agent host's bridges already can't (HAL-15016).

import { join } from "node:path";
import { makePrivateFolder } from "@halonicjs/adapter-fs-node";
import { NodeHarnessBridgeServer, providerHostClass } from "@halonicjs/adapter-harness-bridge";
import { connectorHostClass } from "@halonicjs/adapter-http-kit";
import { createNodeHttpClient } from "@halonicjs/adapter-http-node";
import type { BridgeServers } from "@halonicjs/host-harness-host";
import type {
  HarnessBridgeOptions,
  HarnessBridgeServer,
  HttpClient,
  OpenHarnessBridge,
  Secrets,
} from "@halonicjs/ports";
import type { ProfileFolder } from "@halonicjs/profile";
import { proxySetting } from "./proxy-setting.ts";

/** The folder in the profile where each run's bridge serves its Unix socket, as the agent host's. */
const bridgeSocketsFolder = "bridges";

/** What {@link localBridgeServers} builds from. */
export interface LocalBridgeServersInput {
  /** The only secrets the bridges may read: the keys the provider files name. */
  readonly secrets: Secrets;
  readonly platform: NodeJS.Platform;
  readonly profile: ProfileFolder;
  /** Halonic's other ports on this computer, such as `serve`'s, read on every call. */
  readonly ownPorts?: () => Iterable<number>;
  /**
   * What the bridges call a provider at its own `baseUrl` with, given every
   * port of Halonic's they must never reach; {@link compatibleProviderHttp}
   * by default. A test gives a fake provider.
   */
  readonly compatibleHttp?: (ownPorts: () => Iterable<number>) => HttpClient;
}

/**
 * The bridge servers by placement. A fenced run's bridge serves a Unix
 * socket in the profile where the platform lets a sandboxed program reach
 * one through its sandbox's proxy, as the agent host does (W9, HAL-6316),
 * else a loopback port. A run on this computer has no sandbox and so no
 * proxy, and the launcher refuses a socket bridge: its bridge always serves
 * a loopback port, still guarded by the run's own token. That program
 * already runs with the person's full rights, so loopback opens nothing it
 * couldn't reach anyway.
 *
 * Both reach Anthropic's and OpenAI's own hosts only, and a provider's own
 * `baseUrl` through a client that never reaches one of Halonic's own ports
 * (requirement `cli.bridge-compatible-own-ports`).
 *
 * @example
 * const servers = await localBridgeServers({ secrets, platform, profile, ownPorts: () => [servePort] });
 */
export async function localBridgeServers(input: LocalBridgeServersInput): Promise<BridgeServers> {
  const sockets = input.platform === "linux" || input.platform === "darwin";
  const socketFolder = join(input.profile.root, bridgeSocketsFolder);
  if (sockets) await makePrivateFolder(socketFolder);
  const bridgePorts = new Set<number>();
  const ownPorts = () => [...bridgePorts, ...(input.ownPorts?.() ?? [])];
  const providers = createNodeHttpClient({ hostClass: providerHostClass, proxy: proxySetting });
  const compatible = (input.compatibleHttp ?? compatibleProviderHttp)(ownPorts);
  const serverOn = (where: { socketFolder?: string }) =>
    portsKeptIn(
      bridgePorts,
      new NodeHarnessBridgeServer({
        secrets: input.secrets,
        fetch: (url, init) => providers.fetch(url, init),
        compatibleFetch: (url, init) => compatible.fetch(url, init),
        ...where,
      }),
    );
  return {
    sandbox: serverOn(sockets ? { socketFolder } : {}),
    "this-computer": serverOn({}),
  };
}

/**
 * The client a bridge reaches a compatible provider's own `baseUrl` with:
 * checked as a connector's address is, as the engine's model calls are, so a
 * name can't lead the key onto the person's own network (HAL-13798), and
 * never reaching one of `ownPorts`, which it reads on every request.
 *
 * @example
 * const http = compatibleProviderHttp(() => [...bridgePorts, servePort]);
 */
export function compatibleProviderHttp(ownPorts: () => Iterable<number>): HttpClient {
  const client = createNodeHttpClient({
    hostClass: connectorHostClass,
    ownPorts,
    proxy: proxySetting,
  });
  return { fetch: (url, init) => client.fetch(url, init) };
}

/**
 * The server, keeping in `ports` the loopback port of each bridge it opened
 * until that bridge has closed. A bridge on a Unix socket has no port.
 */
function portsKeptIn(ports: Set<number>, server: HarnessBridgeServer): HarnessBridgeServer {
  return {
    open: async (options: HarnessBridgeOptions): Promise<OpenHarnessBridge> => {
      const bridge = await server.open(options);
      if (bridge.socketPath !== undefined) return bridge;
      const port = Number(new URL(bridge.url).port);
      ports.add(port);
      return {
        ...bridge,
        close: async () => {
          try {
            await bridge.close();
          } finally {
            ports.delete(port);
          }
        },
      };
    },
  };
}
