import { createInterface } from "node:readline";
import { FakePhones, testCode } from "./e2e-session.test-helper.ts";
import { FakeSource } from "./fake-source.test-helper.ts";
import { startGatewayListener } from "./gateway-listener.ts";
import type { GatewayPairing, PairingRefusal, PairingStart } from "./phone-access.ts";

/**
 * The real remote gateway for the phone's interop test in Rust
 * (`apps/studio/src-tauri/crates/tunnel/tests/gateway.rs`, HAL-12244). It
 * starts the listener on loopback, on the gateway tests' fakes, and speaks
 * one JSON object per line:
 *
 * - out, first: `{"port", "hostKey", "code"}`, where to connect, the host's
 *   static key in hex and the open pairing code;
 * - out: `{"decrypted": {"name", "platform", "checkCode"}}` when a pairing's
 *   message 3 decrypted and matched; the host then answers Allow;
 * - in: `{"revoke": "<phone key in hex>"}` revokes a paired phone, which ends
 *   its live session with `not-paired`;
 * - end of input stops the listener and the process.
 *
 * Run from the repository root: `pnpm exec node <this file>`. The keys are
 * made fresh each run and are used nowhere else.
 */

/** One pairing code that stays open, whose every decrypted pairing the person allows. */
class AllowingPairing implements GatewayPairing {
  readonly #phones: FakePhones;
  #wrongTries = 0;

  constructor(phones: FakePhones) {
    this.#phones = phones;
  }

  begin(): PairingStart {
    return {
      kind: "open",
      code: testCode,
      attempt: {
        drop: () => undefined,
        wrongTry: (): PairingRefusal => {
          this.#wrongTries++;
          return { reason: "wrong-code", triesLeft: Math.max(1, 5 - this.#wrongTries) };
        },
        decrypted: async (phone) => {
          say({
            decrypted: { name: phone.name, platform: phone.platform, checkCode: phone.checkCode },
          });
          this.#phones.pair(phone.publicKey);
          return { kind: "allowed" };
        },
      },
    };
  }
}

function say(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

const phones = new FakePhones();
const listener = await startGatewayListener({
  source: new FakeSource(),
  policy: { allowRiskyRemotely: () => false },
  phones,
  pairing: new AllowingPairing(phones),
  onError: (error) => process.stderr.write(`gateway error: ${String(error)}\n`),
});
say({
  port: listener.port,
  hostKey: Buffer.from(phones.host.publicKey).toString("hex"),
  code: testCode,
});

const input = createInterface({ input: process.stdin });
input.on("line", (line) => {
  const command: { revoke?: string } = JSON.parse(line);
  if (command.revoke !== undefined) phones.revoke(Buffer.from(command.revoke, "hex"));
});
input.on("close", () => {
  void listener.close().then(() => process.exit(0));
});
