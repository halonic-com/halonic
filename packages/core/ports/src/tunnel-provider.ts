/** Version of the {@link TunnelProvider} port. A breaking change bumps it and comes with an ADR. */
export const tunnelProviderVersion = 1;

/** The four states a tunnel reports, in the order a healthy start passes through the first two. */
export const tunnelStates = ["starting", "ready", "degraded", "down"] as const;

/** One of {@link tunnelStates}. */
export type TunnelState = (typeof tunnelStates)[number];

/**
 * Why a tunnel is `degraded` or `down`. Studio words each code; there is no
 * free-text fallback, so a provider maps its own errors onto this list.
 */
export const tunnelReasons = [
  "not-installed",
  "signed-out",
  "offline",
  "provider-error",
  "public-refused",
  "stopped",
] as const;

/** One of {@link tunnelReasons}. */
export type TunnelReason = (typeof tunnelReasons)[number];

/** What a provider can do, read before `start` so Studio can explain the choice. */
export interface TunnelCapabilities {
  /** The provider's id, such as "tailscale", "lan" or "fake". */
  readonly id: string;
  /**
   * `true` when the endpoint can be reached from the public internet (a
   * Cloudflare quick tunnel, Tailscale Funnel). Studio treats such a host as
   * public; the remote gateway still accepts only paired devices.
   */
  readonly public: boolean;
  /**
   * `true` when the provider encrypts the path itself (WireGuard, TLS). The
   * gateway protocol always runs inside Halonic's own end-to-end session as
   * well, so this never replaces it.
   */
  readonly encryptsPath: boolean;
}

/**
 * The one thing a tunnel may point at: the remote gateway, on loopback. The
 * host is a literal loopback address, so a config can't name another
 * interface. The bridge, the model gateway, MCP servers and secrets never get
 * a `TunnelConfig` (ADR "Only the remote gateway is reachable by a tunnel").
 */
export interface TunnelConfig {
  readonly gateway: {
    readonly host: "127.0.0.1" | "::1";
    readonly port: number;
  };
}

const loopbackHosts: readonly unknown[] = ["127.0.0.1", "::1"];

function isPort(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 65_535;
}

/**
 * Checks at runtime what {@link TunnelConfig} says at compile time, for a
 * config read from JSON or a setting: exactly a `gateway` with exactly a
 * loopback `host` and a whole-number `port` from 1 to 65535. Throws a
 * `RangeError` otherwise. Every provider's `start` rejects such a config.
 */
export function assertTunnelConfig(config: unknown): asserts config is TunnelConfig {
  const why = tunnelConfigProblem(config);
  if (why !== undefined) throw new RangeError(`not a tunnel config: ${why}`);
}

function tunnelConfigProblem(config: unknown): string | undefined {
  if (typeof config !== "object" || config === null) return "not an object";
  if (Object.keys(config).join() !== "gateway") return "it has fields other than gateway";
  const { gateway } = config as { gateway: unknown };
  if (typeof gateway !== "object" || gateway === null) return "gateway is not an object";
  if (Object.keys(gateway).sort().join() !== "host,port") {
    return "gateway is not exactly host and port";
  }
  const { host, port } = gateway as { host: unknown; port: unknown };
  if (!loopbackHosts.includes(host)) return `host is not 127.0.0.1 or ::1: ${String(host)}`;
  if (!isPort(port)) return `port is not a whole number from 1 to 65535: ${String(port)}`;
  return undefined;
}

/**
 * The host's check before it calls `TunnelProvider.start`: the config passes
 * {@link assertTunnelConfig} and its port is `gatewayPort`, the port the
 * host's own remote gateway listener is bound to. Any other port (the
 * bridge's, the model gateway's) throws a `RangeError`, so the provider is
 * never called for it.
 */
export function assertGatewayTunnelConfig(
  config: unknown,
  gatewayPort: number,
): asserts config is TunnelConfig {
  if (!isPort(gatewayPort)) {
    throw new RangeError(`gateway port is not a whole number from 1 to 65535: ${gatewayPort}`);
  }
  assertTunnelConfig(config);
  if (config.gateway.port !== gatewayPort) {
    throw new RangeError(
      `a tunnel may point only at the remote gateway on port ${gatewayPort}, not ${config.gateway.port}`,
    );
  }
}

/**
 * Where a phone reaches the gateway. `url` uses `https:`, `wss:` or `tcp:`;
 * plain `http:` and `ws:` are never given, so an iOS client needs no
 * exception. A `tcp:` stream carries only the end-to-end session.
 */
export interface TunnelEndpoint {
  /** The provider that made the endpoint, the same as `TunnelCapabilities.id`. */
  readonly providerId: string;
  readonly url: string;
  /** The same as `TunnelCapabilities.public` for this provider. */
  readonly public: boolean;
}

/** One change of a tunnel's state. `reason` is set exactly when `state` is `degraded` or `down`. */
export type TunnelStatus =
  | { readonly state: "starting" | "ready"; readonly at: string }
  | { readonly state: "degraded" | "down"; readonly reason: TunnelReason; readonly at: string };

/**
 * Makes the remote gateway reachable from a phone, and nothing more: it
 * carries bytes. Pairing, encryption and what a phone may do are not its
 * concern (tunnel phase A; requirement `ports.tunnel-provider`).
 *
 * `start` rejects with a `RangeError` a config that fails
 * {@link assertTunnelConfig}. The host calls {@link assertGatewayTunnelConfig}
 * before `start`, so no other port ever reaches a provider. The endpoint's
 * `public` equals `capabilities().public`.
 *
 * A provider handles one tunnel at a time. `start` while a tunnel is up
 * returns its endpoint unchanged when the config is the same, and rejects
 * with a `RangeError` when it isn't. A provider that would expose the gateway
 * publicly while `capabilities().public` is `false` refuses with status
 * `down`, reason `public-refused`, instead of starting.
 *
 * @example
 * const config = { gateway: { host: "127.0.0.1", port: gateway.port } };
 * assertGatewayTunnelConfig(config, gateway.port);
 * const endpoint = await provider.start(config);
 * for await (const status of provider.status()) indicator.show(status.state);
 */
export interface TunnelProvider {
  capabilities(): Promise<TunnelCapabilities>;

  /**
   * Opens the tunnel and resolves with its endpoint once the state is
   * `ready`. Rejects when the tunnel goes `down` first; the status stream
   * says why.
   */
  start(config: TunnelConfig): Promise<TunnelEndpoint>;

  /**
   * The current state first, then every change, never the same state and
   * reason twice in a row. Each call gives a new stream. A stream ends after
   * `stop` has reported `down` with reason `stopped`.
   */
  status(): AsyncIterable<TunnelStatus>;

  /** Closes the tunnel. Calling it when no tunnel is up does nothing. */
  stop(): Promise<void>;
}
