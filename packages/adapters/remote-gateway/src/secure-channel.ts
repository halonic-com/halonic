import type { NoiseSession } from "@halonicjs/adapter-e2e-noise";
import { gatewayMaxMessageBytes, gatewaySessionLimits } from "@halonicjs/ports";
import { type E2eFrame, encodeE2eFrame } from "./e2e-frames.ts";

/** Sends the session's binary frames, one at a time. */
export interface E2eWire {
  /** Sends one binary frame. */
  send(frame: Uint8Array): void;
  /** How many bytes are queued to send and not yet written out. */
  bufferedBytes(): number;
  /** Closes the connection. */
  close(): void;
}

/** What {@link SecureChannel.receive} made of a frame. */
export type ChannelInput =
  /** One gateway message, decrypted. */
  | { readonly kind: "message"; readonly bytes: Uint8Array }
  /** A `rekey` frame: the receiving key changed. */
  | { readonly kind: "rekeyed" }
  /** Anything else ends the session: a wrong kind, a message that doesn't decrypt, one too many without a rekey. */
  | { readonly kind: "broken" };

const { rekeyAfterMessages, rekeyAfterMs } = gatewaySessionLimits;
const nothing = new Uint8Array(0);

/**
 * The transport phase of one end-to-end session: one gateway message in one
 * Noise transport message, and each direction's rekeying (ADR "Pairing and
 * the end-to-end session").
 *
 * The sending side sends a `rekey` frame, its last message under the old
 * key, and then rekeys: once 30 minutes have passed, and when it would
 * otherwise send more than 10,000 transport messages under one key. The
 * `rekey` frame takes the last place of that count, so a key carries at most
 * 9,999 gateway messages and the rekey, as the phone's side counts too. The
 * receiving side rekeys when it reads one, and breaks the session when a
 * 10,001st message comes without one.
 */
export class SecureChannel {
  readonly #noise: NoiseSession;
  readonly #wire: E2eWire;
  #sentSinceRekey = 0;
  #receivedSinceRekey = 0;
  #sendKeySince = Date.now();

  constructor(noise: NoiseSession, wire: E2eWire) {
    this.#noise = noise;
    this.#wire = wire;
  }

  /**
   * Encrypts and sends one gateway message, rekeying first when it is due.
   * Throws for a message over {@link gatewayMaxMessageBytes} and when the
   * Noise session failed; the caller then closes the connection.
   */
  send(message: Uint8Array): void {
    if (message.length > gatewayMaxMessageBytes) {
      throw new RangeError("A gateway message is at most 65,519 bytes.");
    }
    const keyIsOld = Date.now() - this.#sendKeySince >= rekeyAfterMs;
    // The rekey frame needs the last place: after 9,999 messages, it comes next.
    const keyIsFull = this.#sentSinceRekey + 1 >= rekeyAfterMessages;
    if (keyIsFull || keyIsOld) this.#rekey();
    this.#wire.send(encodeE2eFrame("message", this.#noise.writeMessage(message)));
    this.#sentSinceRekey++;
  }

  /**
   * Rekeys the sending direction when it has sent anything under its key, so
   * a quiet session doesn't keep one key for long. The session calls it every
   * 30 minutes.
   */
  rekeyIfUsed(): void {
    if (this.#sentSinceRekey > 0) this.#rekey();
  }

  /** Reads one frame of the transport phase. */
  receive(frame: E2eFrame): ChannelInput {
    try {
      if (frame.kind === "rekey") return this.#readRekey(frame.body);
      if (frame.kind !== "message" || this.#receivedSinceRekey >= rekeyAfterMessages) {
        return { kind: "broken" };
      }
      this.#receivedSinceRekey++;
      return { kind: "message", bytes: this.#noise.readMessage(frame.body) };
    } catch {
      return { kind: "broken" };
    }
  }

  #readRekey(body: Uint8Array): ChannelInput {
    if (this.#noise.readMessage(body).length !== 0) return { kind: "broken" };
    this.#noise.rekeyIncoming();
    this.#receivedSinceRekey = 0;
    return { kind: "rekeyed" };
  }

  #rekey(): void {
    this.#wire.send(encodeE2eFrame("rekey", this.#noise.writeMessage(nothing)));
    this.#noise.rekeyOutgoing();
    this.#sentSinceRekey = 0;
    this.#sendKeySince = Date.now();
  }
}
