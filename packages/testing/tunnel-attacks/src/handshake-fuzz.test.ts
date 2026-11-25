import { gatewayFrameKinds } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type HostRig, openHostRig, type RigPairing } from "./host-rig.ts";
import { PairingPhone } from "./pairing-phone.ts";
import { pairPhone, sendPair1 } from "./pairing-steps.ts";
import type { RigPhone } from "./rig-phone.ts";
import { pick, type Rand, seededRandom } from "./seeded-random.ts";
import { op, type WireClient, wireFrame } from "./wire-client.ts";

const seed = Number(process.env["HALONIC_FUZZ_SEED"] ?? 20_261_121);
const handshakeRuns = Number(process.env["HALONIC_FUZZ_HANDSHAKES"] ?? 200);
/** CI's share of time for the run: a slow runner does fewer of the same runs, in the same order. */
const budgetMs = Number(process.env["HALONIC_FUZZ_BUDGET_MS"] ?? 15_000);

/** The frames a hostile phone may get back: never one from inside a session. */
const handshakeKinds: readonly number[] = [
  gatewayFrameKinds.pair2,
  gatewayFrameKinds.resume2,
  gatewayFrameKinds["handshake-failed"],
  gatewayFrameKinds["pair-refused"],
];

/** Random bytes from `rand`. */
function bytes(rand: Rand, length: number): Buffer {
  return Buffer.from(Array.from({ length }, () => Math.floor(rand() * 256)));
}

/** Ways to break one handshake message (its kind byte and its Noise message) so it can no longer be read. */
const breakers: Record<string, (rand: Rand, message: Buffer) => Buffer> = {
  truncated: (rand, message) => message.subarray(0, 1 + Math.floor(rand() * (message.length - 1))),
  "bit flip": (rand, message) => {
    const flipped = Buffer.from(message);
    const at = Math.floor(rand() * flipped.length);
    flipped[at] = (flipped[at] ?? 0) ^ (1 << Math.floor(rand() * 8));
    return flipped;
  },
  "too long": (rand, message) => Buffer.concat([message, bytes(rand, 1 + Math.floor(rand() * 64))]),
  "too short": (rand, message) =>
    message.subarray(0, Math.max(1, message.length - 1 - Math.floor(rand() * 16))),
};

/** One message broken, and sometimes an extra frame after it: a copy of the message or random bytes. */
function broken(rand: Rand, message: Uint8Array): Buffer[] {
  const breaker = pick(rand, Object.keys(breakers));
  const frames = [breakers[breaker]?.(rand, Buffer.from(message)) ?? Buffer.alloc(0)];
  if (rand() < 0.3)
    frames.push(rand() < 0.5 ? Buffer.from(message) : bytes(rand, 1 + Math.floor(rand() * 96)));
  return frames;
}

/** Writes each message as a binary frame. */
function send(client: WireClient, messages: readonly Buffer[]): void {
  for (const message of messages) client.write(wireFrame(op.binary, message));
}

/** One hostile handshake: message 1 broken, message 3 broken after a good message 1, or a paired phone's reconnect broken. */
async function hostileHandshake(rig: HostRig, pairing: RigPairing, paired: RigPhone, rand: Rand) {
  const roll = rand();
  if (roll < 0.35) {
    const client = await rig.opened();
    send(client, broken(rand, new PairingPhone(await pairing.qr()).pair1()));
    return client;
  }
  if (roll < 0.7) {
    const started = await sendPair1(rig, new PairingPhone(await pairing.qr()));
    if (started.refusal === undefined) send(started.client, broken(rand, started.phone.pair3()));
    return started.client;
  }
  const client = await rig.opened();
  send(client, broken(rand, paired.resume1()));
  return client;
}

/** Keeps a code open for the next run: a minute passes, so the failed tries of the last one are over. */
async function freshCode(rig: HostRig, pairing: RigPairing): Promise<void> {
  await rig.time.advance(61_000);
  const count = (type: string) => pairing.events.filter((event) => event.type === type).length;
  const codes = count("code");
  if (codes > count("code-ended")) return;
  await pairing.session.newCode();
  await pairing.event("code", codes + 1);
}

verifies("tunnel-attacks.handshake-fuzz", () => {
  describe(`handshake messages 1 to 3, seed ${seed}`, () => {
    it("open no session and pair no phone, and the host still pairs and reconnects good phones", async () => {
      const rig = await openHostRig();
      try {
        const paired = (await pairPhone(rig, await rig.startPairing())).reconnecting();
        const pairing = await rig.startPairing();
        const rand = seededRandom(seed);
        const startedAt = Date.now();
        let runs = 0;
        for (; runs < handshakeRuns && Date.now() - startedAt < budgetMs; runs++) {
          await freshCode(rig, pairing);
          const client = await hostileHandshake(rig, pairing, paired, rand);
          const label = `seed ${seed}, run ${runs}`;
          expect(await client.isClosed(), label).toBe(true);
          for (const frame of client.hostFrames(op.binary)) {
            expect(handshakeKinds, label).toContain(frame[0]);
          }
          expect(client.hostFrames(op.text), label).toEqual([]);
        }
        expect(runs, `seed ${seed}`).toBeGreaterThan(0);
        expect(
          pairing.events.filter((event) => event.type === "check"),
          `seed ${seed}`,
        ).toEqual([]);
        expect(rig.phones.phones, `seed ${seed}`).toHaveLength(1);
        expect(rig.source.calls, `seed ${seed}`).toEqual([]);
        await freshCode(rig, pairing);
        await pairPhone(rig, pairing);
        const client = await rig.opened();
        await client.reconnect(paired);
        client.sendJson({ type: "hello", id: "h1", version: 4 });
        expect(await client.frames(1), `seed ${seed}`).toMatchObject([{ type: "welcome" }]);
      } finally {
        await rig.stop();
      }
    }, 60_000);
  });
});
