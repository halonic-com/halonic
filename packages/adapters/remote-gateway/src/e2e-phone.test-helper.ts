import { generateKeyPairSync, randomBytes } from "node:crypto";
import { checkCode, NoiseSession, pairCommit, pairingPsk } from "@halonicjs/adapter-e2e-noise";
import { decodeCleartextFrame, type GatewayCleartextFrame } from "@halonicjs/ports";
import { encodeE2eFrame, readE2eFrame } from "./e2e-frames.ts";

/** An X25519 key pair, raw. */
export interface KeyPair {
  readonly privateKey: Uint8Array;
  readonly publicKey: Uint8Array;
}

/** A fresh X25519 key pair from `node:crypto`. */
export function keyPair(): KeyPair {
  const { privateKey } = generateKeyPairSync("x25519");
  const jwk = privateKey.export({ format: "jwk" });
  return {
    privateKey: Uint8Array.from(Buffer.from(jwk.d ?? "", "base64url")),
    publicKey: Uint8Array.from(Buffer.from(jwk.x ?? "", "base64url")),
  };
}

/** What a phone sends in pairing message 3. */
export interface PhoneDetails {
  name: string;
  platform: string;
  nonce: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * A phone, as far as the tests need one: it speaks the end-to-end session
 * with the real Noise library, so every frame the host reads is one a phone
 * could send, unless a test changes it on purpose.
 */
export class TestPhone {
  readonly keys = keyPair();
  noise: NoiseSession | undefined;
  #payload3 = new Uint8Array(0);

  /** Pairing message 1 for `code`, committing to message 3 with these details. */
  pair1(code: string, details: Partial<PhoneDetails> = {}, commitTo?: Uint8Array): Uint8Array {
    this.#payload3 = encoder.encode(
      JSON.stringify({
        name: "Pixel",
        platform: "android",
        nonce: randomBytes(16).toString("base64url"),
        ...details,
      }),
    );
    this.noise = NoiseSession.start({
      handshake: "pairing",
      role: "initiator",
      localPrivateKey: this.keys.privateKey.slice(),
      psk: pairingPsk(code),
    });
    const commit = pairCommit(this.keys.publicKey, commitTo ?? this.#payload3);
    return encodeE2eFrame(
      "pair1",
      this.#live().writeMessage(encoder.encode(JSON.stringify({ commit }))),
    );
  }

  /** Reads the host's pairing message 2 and gives its payload as JSON. */
  readPair2(frame: Uint8Array): unknown {
    return JSON.parse(decoder.decode(this.#live().readMessage(this.#body(frame, "pair2"))));
  }

  /** Pairing message 3, with the payload committed to in message 1. */
  pair3(): Uint8Array {
    return encodeE2eFrame("pair3", this.#live().writeMessage(this.#payload3));
  }

  /** The check code the phone shows. */
  checkCode(): string {
    return checkCode(this.#live().handshakeHash());
  }

  /** Reconnect message 1, to the host key the phone pinned. */
  resume1(hostKey: Uint8Array): Uint8Array {
    this.noise = NoiseSession.start({
      handshake: "reconnect",
      role: "initiator",
      localPrivateKey: this.keys.privateKey.slice(),
      remotePublicKey: hostKey.slice(),
    });
    return encodeE2eFrame("resume1", this.#live().writeMessage(new Uint8Array(0)));
  }

  /** Reads the host's reconnect message 2. */
  readResume2(frame: Uint8Array): void {
    this.#live().readMessage(this.#body(frame, "resume2"));
  }

  /** One gateway message inside the session. */
  say(message: unknown): Uint8Array {
    return encodeE2eFrame(
      "message",
      this.#live().writeMessage(encoder.encode(JSON.stringify(message))),
    );
  }

  /** Reads one transport frame from the host: a gateway message as JSON, or "rekey". */
  read(frame: Uint8Array): unknown {
    const read = readE2eFrame(frame);
    if (read?.kind === "rekey") {
      this.#live().readMessage(read.body);
      this.#live().rekeyIncoming();
      return "rekey";
    }
    return JSON.parse(decoder.decode(this.#live().readMessage(this.#body(frame, "message"))));
  }

  #body(frame: Uint8Array, kind: string): Uint8Array {
    const read = readE2eFrame(frame);
    if (read?.kind !== kind) throw new Error(`expected a ${kind} frame, got ${read?.kind}`);
    return read.body;
  }

  #live(): NoiseSession {
    if (this.noise === undefined) throw new Error("the phone has no session");
    return this.noise;
  }
}

/** A cleartext frame the host sent, read as the phone reads it. */
export function cleartext(frame: Uint8Array | undefined): GatewayCleartextFrame | undefined {
  return frame === undefined ? undefined : decodeCleartextFrame(frame);
}
