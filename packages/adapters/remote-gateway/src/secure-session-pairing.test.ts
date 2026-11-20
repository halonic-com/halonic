import { gatewayMaxMessageBytes, gatewaySessionLimits } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { encodeE2eFrame } from "./e2e-frames.ts";
import { cleartext, TestPhone } from "./e2e-phone.test-helper.ts";
import { openSecureSession, settle, testCode } from "./e2e-session.test-helper.ts";

const otherCode = "23456789ABCD";

/** A session and a phone that has sent message 1 and read message 2. */
function pairedUpToMessage2(details = {}) {
  const t = openSecureSession();
  const phone = new TestPhone();
  t.session.receive(phone.pair1(testCode, details));
  const hostPayload = phone.readPair2(t.sent[0] ?? new Uint8Array(0));
  return { ...t, phone, hostPayload };
}

verifies("remote-gateway.e2e-session", () => {
  describe("pairing", () => {
    it("pairs a phone the person allows, and runs the gateway protocol inside the session", async () => {
      const t = pairedUpToMessage2({ name: "Work phone", platform: "ios" });
      expect(t.hostPayload).toEqual({ hostName: "Studio desk" });
      t.session.receive(t.phone.pair3());
      const [waiting] = t.pairing.decrypted;
      expect(waiting?.phone).toMatchObject({
        name: "Work phone",
        platform: "ios",
        checkCode: t.phone.checkCode(),
        publicKey: t.phone.keys.publicKey,
      });
      t.pairing.answer({ kind: "allowed" });
      await settle();
      expect(t.phone.read(t.sent[1] ?? new Uint8Array(0))).toEqual({ type: "paired" });
      expect(t.phones.connections).toEqual([]);
      t.session.receive(t.phone.say({ type: "hello", id: "h1", version: 2 }));
      await settle();
      expect(t.phone.read(t.sent[2] ?? new Uint8Array(0))).toEqual({
        type: "welcome",
        replyTo: "h1",
        version: 2,
        maxMessageBytes: gatewayMaxMessageBytes,
      });
      expect(t.phones.connections).toHaveLength(1);
      expect(t.wire.closed).toBe(false);
    });

    it("counts a message 3 made with another code as a wrong try and refuses in cleartext", () => {
      const t = openSecureSession();
      const phone = new TestPhone();
      t.pairing.code = testCode;
      // The phone typed another code: the host tries message 3 against its own.
      t.session.receive(phone.pair1(otherCode));
      phone.readPair2(t.sent[0] ?? new Uint8Array(0));
      t.session.receive(phone.pair3());
      expect(t.pairing.wrongTries).toBe(1);
      expect(t.pairing.decrypted).toEqual([]);
      expect(cleartext(t.sent[1])).toEqual({
        kind: "pair-refused",
        reason: "wrong-code",
        triesLeft: 4,
      });
      expect(t.wire.closed).toBe(true);
    });

    it("counts a message 3 that isn't the one the phone committed to as a wrong try", () => {
      const t = openSecureSession();
      const phone = new TestPhone();
      const committed = new TextEncoder().encode('{"name":"Pixel"}');
      t.session.receive(phone.pair1(testCode, {}, committed));
      phone.readPair2(t.sent[0] ?? new Uint8Array(0));
      t.session.receive(phone.pair3());
      expect(t.pairing.wrongTries).toBe(1);
      expect(t.pairing.decrypted).toEqual([]);
      expect(t.wire.closed).toBe(true);
    });

    it("counts a message 3 whose payload breaks the rules as a wrong try", () => {
      const t = pairedUpToMessage2({ platform: "windows" });
      t.session.receive(t.phone.pair3());
      expect(t.pairing.wrongTries).toBe(1);
      expect(t.pairing.decrypted).toEqual([]);
    });

    it("counts a pairing that ends after message 2 as one wrong try", () => {
      const t = pairedUpToMessage2();
      t.session.close();
      t.session.close();
      expect(t.pairing.wrongTries).toBe(1);
    });

    it("still closes the wire, then throws, when the pairing service fails to count the try", () => {
      const t = pairedUpToMessage2();
      t.pairing.failsToCount = true;
      expect(() => t.session.close()).toThrow("the pairing service failed");
      expect(t.wire.closed).toBe(true);
    });

    it("reports, and doesn't throw out of its timer, when the pairing service fails to count a timed-out try", () => {
      vi.useFakeTimers();
      try {
        const t = pairedUpToMessage2();
        t.pairing.failsToCount = true;
        expect(() => vi.advanceTimersByTime(gatewaySessionLimits.handshakeTimeoutMs)).not.toThrow();
        expect(t.errors).toEqual([new Error("the pairing service failed")]);
        expect(t.wire.closed).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it("sends not-paired to a phone revoked between paired and its hello", async () => {
      const t = pairedUpToMessage2();
      t.session.receive(t.phone.pair3());
      t.pairing.answer({ kind: "allowed" });
      await settle();
      expect(t.phone.read(t.sent[1] ?? new Uint8Array(0))).toEqual({ type: "paired" });
      t.phones.revoke(t.phone.keys.publicKey);
      t.session.receive(t.phone.say({ type: "hello", id: "h1", version: 2 }));
      expect(t.phone.read(t.sent[2] ?? new Uint8Array(0))).toEqual({ type: "not-paired" });
      expect(t.phones.connections).toEqual([]);
      expect(t.wire.closed).toBe(true);
    });

    it("refuses before message 2 when no code is open", () => {
      const t = openSecureSession();
      t.pairing.code = undefined;
      t.session.receive(new TestPhone().pair1(testCode));
      expect(t.sent.map(cleartext)).toEqual([
        { kind: "pair-refused", reason: "code-ended", triesLeft: 0 },
      ]);
      expect(t.wire.closed).toBe(true);
    });

    it("sends nothing and counts no try for a message 1 it can't read", () => {
      const t = openSecureSession();
      t.session.receive(encodeE2eFrame("pair1", new Uint8Array(20)));
      expect(t.sent).toEqual([]);
      expect(t.pairing.drops).toBe(1);
      expect(t.pairing.wrongTries).toBe(0);
      expect(t.wire.closed).toBe(true);
    });

    it("sends an encrypted pair-refused when the person doesn't allow it", async () => {
      const t = pairedUpToMessage2();
      t.session.receive(t.phone.pair3());
      t.pairing.answer({ kind: "denied" });
      await settle();
      expect(t.phone.read(t.sent[1] ?? new Uint8Array(0))).toEqual({
        type: "pair-refused",
        reason: "denied",
      });
      expect(t.wire.closed).toBe(true);
    });

    it("ends the pairing when the phone leaves while the person decides", async () => {
      const t = pairedUpToMessage2();
      t.session.receive(t.phone.pair3());
      t.session.close();
      expect(t.pairing.decrypted[0]?.signal.aborted).toBe(true);
      t.pairing.answer({ kind: "allowed" });
      await settle();
      expect(t.sent).toHaveLength(1);
      expect(t.pairing.wrongTries).toBe(0);
    });

    it("closes on any frame the phone sends before the person's answer", () => {
      const t = pairedUpToMessage2();
      t.session.receive(t.phone.pair3());
      t.session.receive(t.phone.say({ type: "hello", id: "h1", version: 2 }));
      expect(t.wire.closed).toBe(true);
    });

    it("closes on a handshake message over 1,024 bytes", () => {
      const t = openSecureSession();
      t.session.receive(encodeE2eFrame("pair1", new Uint8Array(1_025)));
      expect(t.sent).toEqual([]);
      expect(t.wire.closed).toBe(true);
    });
  });
});
