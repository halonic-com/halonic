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
 * A provider handles one tunnel at a time. `start` while a tunnel is up
 * returns its endpoint unchanged when the config is the same, and rejects
 * with a `RangeError` when it isn't. A provider that would expose the gateway
 * publicly while `capabilities().public` is `false` refuses with status
 * `down`, reason `public-refused`, instead of starting.
 *
 * @example
 * const endpoint = await provider.start({ gateway: { host: "127.0.0.1", port } });
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
