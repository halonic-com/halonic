import { randomBytes } from "node:crypto";
import { checkCode, NoiseSession, pairCommit, pairingPsk } from "@halonicjs/adapter-e2e-noise";
import {
  decodeCleartextFrame,
  type GatewayCleartextFrame,
  gatewayFrameKinds,
} from "@halonicjs/ports";
import { type KeyPair, keyPair, RigPhone } from "./rig-phone.ts";

/** What a phone takes from a pairing QR code: the host key it pins and the code. */
export interface ScannedQr {
  readonly hostKey: Uint8Array;
  readonly code: string;
}

/** A binary frame: the kind byte, then the Noise message. */
function frame(kind: keyof typeof gatewayFrameKinds, body: Uint8Array): Uint8Array {
  return Uint8Array.of(gatewayFrameKinds[kind], ...body);
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * A phone that pairs as the ADR has it, with the real Noise library: it
 * commits to message 3 in message 1, checks in message 2 that the host is the
 * one in the QR code, and then speaks inside the session. A test changes a
 * step on purpose, such as the code it uses, to attack the host with it.
 */
export class PairingPhone {
  readonly keys: KeyPair = keyPair();
  readonly #qr: ScannedQr;
  readonly #payload3: Uint8Array;
  #noise: NoiseSession | undefined;

  constructor(qr: ScannedQr, name = "Rig phone") {
    this.#qr = qr;
    const nonce = randomBytes(16).toString("base64url");
    this.#payload3 = encoder.encode(JSON.stringify({ name, platform: "android", nonce }));
  }

  /** Pairing message 1: the commitment to message 3, under the code's psk. */
  pair1(): Uint8Array {
    this.#noise = NoiseSession.start({
      handshake: "pairing",
      role: "initiator",
      localPrivateKey: this.keys.privateKey.slice(),
      psk: pairingPsk(this.#qr.code),
    });
    const commit = pairCommit(this.keys.publicKey, this.#payload3);
    return frame("pair1", this.#live().writeMessage(encoder.encode(JSON.stringify({ commit }))));
  }

  /** Reads the host's message 2 and gives its payload. */
  readPair2(bytes: Uint8Array): unknown {
    if (bytes[0] !== gatewayFrameKinds.pair2) throw new Error(`not message 2: kind ${bytes[0]}`);
    return JSON.parse(decoder.decode(this.#live().readMessage(bytes.subarray(1))));
  }

  /**
   * Pairing message 3, with the payload committed to in message 1. Throws
   * unless the handshake's host is the host key in the QR code, which Noise
   * tells once message 3 is written.
   */
  pair3(): Uint8Array {
    const message = frame("pair3", this.#live().writeMessage(this.#payload3));
    const hostKey = this.#live().remoteStaticKey();
    if (Buffer.compare(Buffer.from(hostKey), Buffer.from(this.#qr.hostKey)) !== 0) {
      throw new Error("the handshake's host isn't the one in the QR code");
    }
    return message;
  }

  /** The check code this phone shows. */
  checkCode(): string {
    return checkCode(this.#live().handshakeHash());
  }

  /** Reads one transport frame from the host inside the session, as JSON. */
  read(bytes: Uint8Array): unknown {
    if (bytes[0] !== gatewayFrameKinds.message) throw new Error(`not a message: kind ${bytes[0]}`);
    return JSON.parse(decoder.decode(this.#live().readMessage(bytes.subarray(1))));
  }

  /** The same phone once paired, reconnecting to the host key it pinned. */
  reconnecting(): RigPhone {
    return new RigPhone(this.#qr.hostKey, this.keys);
  }

  #live(): NoiseSession {
    if (this.#noise === undefined) throw new Error("the phone hasn't started pairing");
    return this.#noise;
  }
}

/** A cleartext frame the host sent, as a phone reads it; `undefined` for any other frame. */
export function cleartext(bytes: Uint8Array | undefined): GatewayCleartextFrame | undefined {
  return bytes === undefined ? undefined : decodeCleartextFrame(bytes);
}
