import type { TunnelEndpoint } from "./tunnel-provider.ts";

/** Version of the {@link TunnelResolver} port. A breaking change bumps it and comes with an ADR. */
export const tunnelResolverVersion = 1;

/**
 * How a transport waits between tries to reconnect: `firstDelayMs` after the
 * first drop, times `factor` after each failed try, at most `maxDelayMs`, each
 * delay moved by up to `jitter` of itself either way. A connection that stays
 * open for `resetAfterMs` starts again from `firstDelayMs`.
 */
export const tunnelBackoff = {
  firstDelayMs: 500,
  factor: 2,
  maxDelayMs: 30_000,
  jitter: 0.2,
  resetAfterMs: 30_000,
} as const;

/**
 * The delay before reconnect try `attempt` (1 for the first try after a
 * drop), by {@link tunnelBackoff}. `random` is a number from 0 up to 1, such
 * as `Math.random()`; 0.5 gives the delay without jitter. Every transport
 * uses this one rule, so phones and the fake provider back off alike.
 */
export function tunnelReconnectDelayMs(attempt: number, random: number): number {
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new RangeError(`attempt must be a whole number from 1: ${attempt}`);
  }
  const { firstDelayMs, factor, maxDelayMs, jitter } = tunnelBackoff;
  const base = Math.min(maxDelayMs, firstDelayMs * factor ** (attempt - 1));
  return Math.round(base * (1 + jitter * (2 * random - 1)));
}

/**
 * A transport's state. `paused` means the app went to the background: the
 * transport closed its connection and doesn't try again until `resume`.
 */
export type TunnelTransportState = "connecting" | "open" | "reconnecting" | "paused" | "closed";

/**
 * A byte pipe from the phone to one host's remote gateway, reconnecting by
 * itself. It carries the end-to-end session's frames and never reads them.
 *
 * **Reconnect.** When the connection drops, the state goes to `reconnecting`
 * and the transport tries again after {@link tunnelReconnectDelayMs}, without
 * a limit on tries, for as long as the app is in the foreground. A frame sent
 * while not `open` rejects; frames are never queued or sent again after a
 * reconnect. Each reconnect is a new connection: the session layer starts a
 * new handshake and the gateway protocol resumes its sessions from the last
 * event it saw.
 *
 * **Foreground only.** `pause` closes the connection and stops every timer,
 * because a phone (iOS above all) may freeze a background app at any moment.
 * `resume` connects at once, with no delay, and starts the backoff from the
 * first try.
 */
export interface TunnelTransport {
  readonly state: TunnelTransportState;

  /** Calls `listener` on each change of state; returns a function that stops it. */
  onState(listener: (state: TunnelTransportState) => void): () => void;

  /** Sends one frame. Rejects unless the state is `open`. */
  send(frame: Uint8Array): Promise<void>;

  /**
   * Every frame received, in order, across reconnects. The stream ends when
   * the transport is closed.
   */
  frames(): AsyncIterable<Uint8Array>;

  /** Closes the connection and stops reconnecting until {@link resume}. */
  pause(): void;

  /** Connects again at once after {@link pause}; does nothing in any other state. */
  resume(): void;

  /** Closes the transport for good; the state becomes `closed`. */
  close(): Promise<void>;
}

/**
 * Turns an endpoint from a pairing into a transport, on the phone (tunnel
 * phase A; requirement `ports.tunnel-resolver`). It refuses with a
 * `RangeError` an endpoint whose URL scheme isn't `https:`, `wss:` or `tcp:`.
 *
 * @example
 * const transport = await resolver.resolve(pairing.endpoint);
 * app.onBackground(() => transport.pause());
 */
export interface TunnelResolver {
  /**
   * Resolves once the first connection is `open`, or rejects when the first
   * try fails; only a connection that was open once reconnects by itself.
   */
  resolve(endpoint: TunnelEndpoint): Promise<TunnelTransport>;
}
