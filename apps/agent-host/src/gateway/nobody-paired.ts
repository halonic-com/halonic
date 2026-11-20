import { randomBytes } from "node:crypto";
import type {
  GatewayPairing,
  GatewayPhones,
  PairingStart,
} from "@halonicjs/adapter-remote-gateway";

/**
 * The gateway's host key and phones until the pairing service and the phone
 * store exist (tunnel B2): no pairing is ever open and no phone is paired, so
 * every phone is refused, and the host key is a fresh one for this launch,
 * kept in memory only. The gateway is off in every launch the executable
 * makes until then (requirement `agent-host.remote-gateway`).
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
