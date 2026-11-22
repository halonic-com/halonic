/**
 * The port between the gateway client and the phone's shell, for one paired
 * computer (tunnel D7, design on HAL-15159, section 1). The shell keeps the
 * keys, the sealing and the frames; the page keeps the protocol. The shell's
 * adapter (HAL-15177) binds the computer, so nothing here names it.
 */

import type { PhoneState } from "./phone-status.ts";

/**
 * What the shell tells the page about the computer, in order:
 *
 * - `status`: the connection's state, for the header label (D6);
 * - `session-opened`: a session's handshake finished. `generation` names that
 *   session; it is never reused, so a message built for an earlier session
 *   never goes out on a later one;
 * - `message`: one host message of that session, as text, not yet read.
 */
export type ComputerTunnelEvent =
  | { readonly kind: "status"; readonly state: PhoneState }
  | { readonly kind: "session-opened"; readonly generation: number }
  | { readonly kind: "message"; readonly generation: number; readonly text: string };

/**
 * Why the shell refused to send a message. It sent nothing, and the session
 * stays open:
 *
 * - `not-open`: no session is open, or `generation` isn't the open one's;
 * - `too-large`: more than `gatewayMaxMessageBytes` bytes of UTF-8;
 * - `not-allowed`: not one JSON object of a type the phone may send.
 */
export type ComputerTunnelRefusal = "not-open" | "too-large" | "not-allowed";

/** What became of one {@link ComputerTunnel.send}. The shell never queues or retries. */
export type ComputerTunnelSendResult =
  | { readonly sent: true }
  | { readonly sent: false; readonly reason: ComputerTunnelRefusal };

/** The shell's side of the tunnel to one computer. */
export interface ComputerTunnel {
  /** Seals one message into the session of `generation` and sends it. */
  send(generation: number, text: string): Promise<ComputerTunnelSendResult>;
  /**
   * Ends the session of `generation`, as the page does on any host message
   * it refuses. Unlike the connection's final close, this keeps the
   * computer: the shell reconnects after its own backoff, so a host can't
   * make the phone reconnect faster by misbehaving. The native command is
   * `tunnel_end_session`.
   */
  endSession(generation: number): Promise<void>;
  /**
   * Calls `listener` with every event until the returned function is called.
   * A new subscriber first gets the current `status` and, if a session is
   * open, its `session-opened`; then the live events.
   */
  subscribe(listener: (event: ComputerTunnelEvent) => void): () => void;
}
