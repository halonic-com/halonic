import { randomBytes } from "node:crypto";
import type {
  GatewayPairing,
  GatewayPhones,
  PairingStart,
} from "@halonicjs/adapter-remote-gateway";

/**
 * A gateway's host key and phones with no pairing desk and no phone store:
 * no pairing is ever open and no phone is paired, so every phone is refused,
 * and the host key is a fresh one, kept in memory only. Tests start a
 * gateway on it; the host itself always starts its gateway on its desk and
 * store (requirement `agent-host.remote-gateway-access`).
 */
export class NobodyPaired implements GatewayPhones, GatewayPairing {
  readonly #hostKey = new Uint8Array(randomBytes(32));

  hostPrivateKey(): Uint8Array {
    return this.#hostKey.slice();
  }

  hostName(): string {
    return "";
  }

  isPaired(): boolean {
    return false;
  }

  connected(): never {
    throw new Error("No phone is paired, so none can connect.");
  }

  begin(): PairingStart {
    return { kind: "refused", refusal: { reason: "code-ended", triesLeft: 0 } };
  }
}
