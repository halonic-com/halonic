import { readFile } from "node:fs/promises";
import { pairingRules } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type HostRig, openHostRig } from "./host-rig.ts";
import { cleartext, PairingPhone } from "./pairing-phone.ts";
import { pairPhone, reachCheck, sendPair1, tryCode, verdict, wrongCode } from "./pairing-steps.ts";
import { op, wireFrame } from "./wire-client.ts";

const minuteMs = 60_000;
const codeEnded = { kind: "pair-refused", reason: "code-ended", triesLeft: 0 };

/** The phones in the paired phones file; none when there is no file. */
async function storedPhones(rig: HostRig): Promise<unknown[]> {
  const text = await readFile(rig.storeFile, "utf8").catch(() => undefined);
  return text === undefined ? [] : (JSON.parse(text) as { phones: unknown[] }).phones;
}

/** Runs `attack` on a fresh host rig and stops the rig afterwards. */
async function onHost(attack: (rig: HostRig) => Promise<void>): Promise<void> {
  const rig = await openHostRig();
  try {
    await attack(rig);
  } finally {
    await rig.stop();
  }
}

verifies("tunnel-attacks.pairing-attacks", () => {
  describe("a QR code used again (B2)", () => {
    it("is refused once its phone paired, and pairs nobody else", async () => {
      await onHost(async (rig) => {
        const pairing = await rig.startPairing();
        const qr = await pairing.qr();
        await pairPhone(rig, pairing);
        const replay = await sendPair1(rig, new PairingPhone(qr, "Replayed"));
        expect(replay.refusal).toEqual(codeEnded);
        expect(rig.phones.phones.map((phone) => phone.name)).toEqual(["Rig phone"]);
        expect(await storedPhones(rig)).toHaveLength(1);
      });
    });
  });

  describe("a QR code after it expired (B3)", () => {
    it("is refused, and the dialog says the code expired", async () => {
      await onHost(async (rig) => {
        const pairing = await rig.startPairing();
        const qr = await pairing.qr();
        await rig.time.advance(pairingRules.codeLifetimeMs);
        expect(await pairing.event("code-ended")).toMatchObject({ reason: "code-expired" });
        expect((await sendPair1(rig, new PairingPhone(qr))).refusal).toEqual(codeEnded);
        expect(rig.phones.phones).toEqual([]);
      });
    });
  });

  describe("a code another phone used", () => {
    it("is refused while the first phone waits for Allow, also as a replay of that phone's message 1", async () => {
      await onHost(async (rig) => {
        const pairing = await rig.startPairing();
        const qr = await pairing.qr();
        const first = await reachCheck(rig, pairing);
        const used = { kind: "pair-refused", reason: "code-used", triesLeft: 0 };
        expect((await sendPair1(rig, new PairingPhone(qr, "Second"))).refusal).toEqual(used);
        const replay = await rig.opened();
        replay.write(wireFrame(op.binary, first.message1));
        expect(cleartext(await replay.binaryFrame(0))).toEqual(used);
        await pairing.session.allow();
        expect(await verdict(first.phone, first.client)).toEqual({ type: "paired" });
        expect(rig.phones.phones.map((phone) => phone.name)).toEqual(["Rig phone"]);
      });
    });
  });

  describe("many pairing attempts in a row (B5)", () => {
    it("ends a code after 5 wrong tries, a handshake left after message 2 counting as one", async () => {
      await onHost(async (rig) => {
        const pairing = await rig.startPairing();
        const qr = await pairing.qr();
        for (const triesLeft of [4, 3, 2, 1]) {
          const refusal = await tryCode(rig, wrongCode(qr));
          expect(refusal).toEqual({ kind: "pair-refused", reason: "wrong-code", triesLeft });
        }
        const left = await sendPair1(rig, new PairingPhone(wrongCode(qr)));
        left.client.end();
        expect(await pairing.event("code-ended")).toMatchObject({ reason: "too-many-tries" });
        expect((await sendPair1(rig, new PairingPhone(qr))).refusal).toEqual(codeEnded);
        expect(rig.phones.phones).toEqual([]);
      });
    });

    it("refuses message 1 after 10 failed tries in a minute across codes, until the minute is over", async () => {
      await onHost(async (rig) => {
        const pairing = await rig.startPairing();
        for (const code of [1, 2]) {
          const qr = await pairing.qr();
          for (let tries = 0; tries < pairingRules.wrongTriesPerCode; tries++) {
            await tryCode(rig, wrongCode(qr));
          }
          await pairing.event("code-ended", code);
          await pairing.session.newCode();
          await pairing.event("code", code + 1);
        }
        const rightCode = new PairingPhone(await pairing.qr());
        const limited = { kind: "pair-refused", reason: "rate-limited", triesLeft: 0 };
        expect((await sendPair1(rig, rightCode)).refusal).toEqual(limited);
        await rig.time.advance(minuteMs);
        await pairPhone(rig, pairing);
        expect(rig.phones.phones).toHaveLength(1);
      });
    });
  });

  describe("the check code and Allow", () => {
    it("leaves no paired record when the person presses Don't allow on the check code", async () => {
      await onHost(async (rig) => {
        const pairing = await rig.startPairing();
        const { phone, client } = await reachCheck(rig, pairing);
        expect((await pairing.event("check")).checkCode).toBe(phone.checkCode());
        await pairing.session.deny();
        // Encrypted: the phone reads it inside the session, not as a cleartext refusal.
        expect(await verdict(phone, client)).toEqual({ type: "pair-refused", reason: "denied" });
        expect(await client.isClosed()).toBe(true);
        await expect(pairing.session.allow()).rejects.toThrow();
        expect(rig.phones.phones).toEqual([]);
        expect(await storedPhones(rig)).toEqual([]);
      });
    });

    it("leaves no paired record when nobody presses Allow within 2 minutes", async () => {
      await onHost(async (rig) => {
        const pairing = await rig.startPairing();
        const { phone, client } = await reachCheck(rig, pairing);
        await rig.time.advance(pairingRules.allowWaitMs);
        expect(await verdict(phone, client)).toEqual({ type: "pair-refused", reason: "timed-out" });
        expect(await pairing.event("code-ended")).toMatchObject({ reason: "allow-timed-out" });
        await expect(pairing.session.allow()).rejects.toThrow();
        expect(rig.phones.phones).toEqual([]);
        expect(await storedPhones(rig)).toEqual([]);
      });
    });
  });
});
