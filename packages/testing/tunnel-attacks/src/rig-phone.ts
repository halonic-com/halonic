import { generateKeyPairSync } from "node:crypto";
import { NoiseSession } from "@halonicjs/adapter-e2e-noise";
import type {
  GatewayPairing,
  GatewayPhones,
  PairingStart,
} from "@halonicjs/adapter-remote-gateway";
import { gatewayFrameKinds } from "@halonicjs/ports";

/** An X25519 key pair, raw. */
export interface KeyPair {
  readonly privateKey: Uint8Array;
  readonly publicKey: Uint8Array;
}

/** A fresh X25519 key pair from `node:crypto`. */
export function keyPair(): KeyPair {
  const jwk = generateKeyPairSync("x25519").privateKey.export({ format: "jwk" });
  return {
    privateKey: Uint8Array.from(Buffer.from(jwk.d ?? "", "base64url")),
    publicKey: Uint8Array.from(Buffer.from(jwk.x ?? "", "base64url")),
  };
}

/**
 * The host's key and its paired phones, in memory, as the rig's gateway sees
 * them. No pairing is ever open: phase B's pairing attacks are B7's, against
 * the real pairing service.
 */
export class RigPhones implements GatewayPhones, GatewayPairing {
  readonly host = keyPair();
  readonly #paired = new Set<string>();

  hostPrivateKey(): Uint8Array {
    return this.host.privateKey.slice();
  }

  hostName(): string {
    return "Rig host";
  }

  isPaired(publicKey: Uint8Array): boolean {
    return this.#paired.has(Buffer.from(publicKey).toString("hex"));
  }

  connected() {
    return { end: () => undefined };
  }

  begin(): PairingStart {
    return { kind: "refused", refusal: { reason: "code-ended", triesLeft: 0 } };
  }

  /** Pairs a new phone and gives it. */
  pairPhone(): RigPhone {
    const phone = new RigPhone(this.host.publicKey);
    this.#paired.add(Buffer.from(phone.keys.publicKey).toString("hex"));
    return phone;
  }
}

/** A binary frame: the kind byte, then the Noise message. */
function frame(kind: keyof typeof gatewayFrameKinds, body: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(1 + body.length);
  bytes[0] = gatewayFrameKinds[kind];
  bytes.set(body, 1);
  return bytes;
}

/** A paired phone, speaking the end-to-end session with the real Noise library. */
export class RigPhone {
  readonly keys = keyPair();
  readonly #hostKey: Uint8Array;
  #noise: NoiseSession | undefined;

  constructor(hostKey: Uint8Array) {
    this.#hostKey = hostKey;
  }

  /** Reconnect message 1, to the host key the phone pinned. */
  resume1(): Uint8Array {
    this.#noise = NoiseSession.start({
      handshake: "reconnect",
      role: "initiator",
      localPrivateKey: this.keys.privateKey.slice(),
      remotePublicKey: this.#hostKey.slice(),
    });
    return frame("resume1", this.#live().writeMessage(new Uint8Array(0)));
  }

  /** Reads one frame from the host: message 2, a gateway message (its bytes) or a rekey. */
  read(bytes: Uint8Array): Uint8Array | "resume2" | "rekey" {
    const kind = bytes[0];
    const payload = this.#live().readMessage(bytes.subarray(1));
    if (kind === gatewayFrameKinds.resume2) return "resume2";
    if (kind === gatewayFrameKinds.rekey) {
      this.#live().rekeyIncoming();
      return "rekey";
    }
    return payload;
  }

  /** One gateway message's bytes inside the session. */
  seal(message: Uint8Array): Uint8Array {
    return frame("message", this.#live().writeMessage(message));
  }

  #live(): NoiseSession {
    if (this.#noise === undefined) throw new Error("the phone hasn't reconnected");
    return this.#noise;
  }
}
