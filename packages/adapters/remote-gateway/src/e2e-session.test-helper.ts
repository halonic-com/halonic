import { keyPair } from "./e2e-phone.test-helper.ts";
import { FakeSource } from "./fake-source.test-helper.ts";
import { GatewayConnection } from "./gateway-connection.ts";
import type {
  GatewayPairing,
  GatewayPhones,
  PairingAnswer,
  PairingPhone,
  PairingRefusal,
  PairingStart,
} from "./phone-access.ts";
import { SecureSession } from "./secure-session.ts";

/** A valid pairing code, in the pairing alphabet. */
export const testCode = "4F72KQ9XHMRT";

/**
 * The pairing service, as a test drives it: one open code (or none), and a
 * record of what the gateway reported. The person's answer is whatever the
 * test resolves `answer` with.
 */
export class FakePairing implements GatewayPairing {
  code: string | undefined = testCode;
  wrongTries = 0;
  drops = 0;
  decrypted: { phone: PairingPhone; signal: AbortSignal }[] = [];
  #resolve: ((answer: PairingAnswer) => void) | undefined;

  begin(): PairingStart {
    if (this.code === undefined) {
      return { kind: "refused", refusal: { reason: "code-ended", triesLeft: 0 } };
    }
    return {
      kind: "open",
      code: this.code,
      attempt: {
        drop: () => {
          this.drops++;
        },
        wrongTry: (): PairingRefusal => {
          this.wrongTries++;
          return { reason: "wrong-code", triesLeft: 5 - this.wrongTries };
        },
        decrypted: (phone, signal) => {
          this.decrypted.push({ phone, signal });
          return new Promise((resolve) => {
            this.#resolve = resolve;
          });
        },
      },
    };
  }

  /** The person's answer, or a refusal, for the pairing waiting for one. */
  answer(answer: PairingAnswer): void {
    this.#resolve?.(answer);
  }
}

/** The host's key and its paired phones, recording each connection. */
export class FakePhones implements GatewayPhones {
  readonly host = keyPair();
  readonly paired = new Set<string>();
  readonly connections: { key: string; revoke: () => void; ended: boolean }[] = [];

  hostPrivateKey(): Uint8Array {
    return this.host.privateKey.slice();
  }

  hostName(): string {
    return "Studio desk";
  }

  isPaired(publicKey: Uint8Array): boolean {
    return this.paired.has(Buffer.from(publicKey).toString("hex"));
  }

  connected(publicKey: Uint8Array, onRevoked: () => void) {
    const connection = {
      key: Buffer.from(publicKey).toString("hex"),
      revoke: onRevoked,
      ended: false,
    };
    this.connections.push(connection);
    return {
      end: () => {
        connection.ended = true;
      },
    };
  }

  /** Pairs the phone with this public key. */
  pair(publicKey: Uint8Array): void {
    this.paired.add(Buffer.from(publicKey).toString("hex"));
  }
}

/** A session on fakes, with the frames it sent and whether it closed. */
export function openSecureSession(options: { helloTimeoutMs?: number; phones?: FakePhones } = {}) {
  const pairing = new FakePairing();
  const phones = options.phones ?? new FakePhones();
  const source = new FakeSource();
  source.addSession("s1");
  const sent: Uint8Array[] = [];
  const wire = { closed: false, buffered: 0 };
  const session = new SecureSession({
    phones,
    pairing,
    helloTimeoutMs: options.helloTimeoutMs ?? 10_000,
    wire: {
      send: (frame) => {
        sent.push(frame);
      },
      bufferedBytes: () => wire.buffered,
      close: () => {
        wire.closed = true;
      },
    },
    openConnection: (transport) =>
      new GatewayConnection({ source, policy: { allowRiskyRemotely: () => false }, transport }),
  });
  return { session, pairing, phones, source, sent, wire };
}

/** Lets queued promises, and the connection's chain, run. */
export async function settle(): Promise<void> {
  for (let turn = 0; turn < 20; turn++) await Promise.resolve();
}
