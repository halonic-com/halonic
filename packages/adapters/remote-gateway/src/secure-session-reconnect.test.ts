import { gatewaySessionLimits } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeE2eFrame } from "./e2e-frames.ts";
import { cleartext, keyPair, TestPhone } from "./e2e-phone.test-helper.ts";
import { openSecureSession, settle } from "./e2e-session.test-helper.ts";

const hello = { type: "hello", id: "h1", version: 2 };

/** A session, a paired phone and its reconnect, up to the host's message 2. */
function reconnected(options: { paired?: boolean; helloTimeoutMs?: number } = {}) {
  const t = openSecureSession(options);
  const phone = new TestPhone();
  if (options.paired !== false) t.phones.pair(phone.keys.publicKey);
  t.session.receive(phone.resume1(t.phones.host.publicKey));
  phone.readResume2(t.sent[0] ?? new Uint8Array(0));
  return { ...t, phone };
}

verifies("remote-gateway.e2e-session", () => {
  describe("reconnecting", () => {
    it("lets a paired phone in, and counts it as connected only once hello decrypts", async () => {
      const t = reconnected();
      expect(t.phones.connections).toEqual([]);
      t.session.receive(t.phone.say(hello));
      await settle();
      expect(t.phone.read(t.sent[1] ?? new Uint8Array(0))).toMatchObject({ type: "welcome" });
      expect(t.phones.connections).toHaveLength(1);
    });

    it("sends not-paired only after message 2, encrypted, to a phone it doesn't know", () => {
      const t = reconnected({ paired: false });
      expect(t.sent).toHaveLength(2);
      expect(t.phone.read(t.sent[1] ?? new Uint8Array(0))).toEqual({ type: "not-paired" });
      expect(t.wire.closed).toBe(true);
    });

    it("sends handshake-failed in cleartext, and no message 2, to a phone that pinned another key", () => {
      const t = openSecureSession();
      const phone = new TestPhone();
      t.phones.pair(phone.keys.publicKey);
      t.session.receive(phone.resume1(keyPair().publicKey));
      expect(t.sent.map(cleartext)).toEqual([{ kind: "handshake-failed" }]);
      expect(t.wire.closed).toBe(true);
    });

    it("never counts a replayed message 1 as a connection", () => {
      const t = openSecureSession();
      const phone = new TestPhone();
      t.phones.pair(phone.keys.publicKey);
      const message1 = phone.resume1(t.phones.host.publicKey);
      t.session.receive(message1);
      const replay = openSecureSession({ phones: t.phones });
      replay.session.receive(message1);
      // Whoever replays it can't read message 2, so all it can send is bytes that don't decrypt.
      replay.session.receive(encodeE2eFrame("message", new Uint8Array(40)));
      expect(t.phones.connections).toEqual([]);
      expect(replay.wire.closed).toBe(true);
    });

    it("sends not-paired and closes when the phone is revoked while connected", async () => {
      const t = reconnected();
      t.session.receive(t.phone.say(hello));
      await settle();
      t.phones.connections[0]?.revoke();
      expect(t.phone.read(t.sent[1] ?? new Uint8Array(0))).toMatchObject({ type: "welcome" });
      expect(t.phone.read(t.sent[2] ?? new Uint8Array(0))).toEqual({ type: "not-paired" });
      expect(t.wire.closed).toBe(true);
      expect(t.phones.connections[0]?.ended).toBe(true);
    });

    it("sends not-paired to a phone revoked after message 2 and before its hello", () => {
      const t = reconnected();
      t.phones.revoke(t.phone.keys.publicKey);
      t.session.receive(t.phone.say(hello));
      expect(t.sent).toHaveLength(2);
      expect(t.phone.read(t.sent[1] ?? new Uint8Array(0))).toEqual({ type: "not-paired" });
      expect(t.phones.connections).toEqual([]);
      expect(t.wire.closed).toBe(true);
    });

    it("ends the store's handle when the store says revoked as the phone connects", () => {
      const t = reconnected();
      const connect = t.phones.connected.bind(t.phones);
      // The revoke lands between the session's isPaired and connected.
      t.phones.connected = (publicKey, onRevoked) => {
        const phone = connect(publicKey, onRevoked);
        onRevoked();
        return phone;
      };
      t.session.receive(t.phone.say(hello));
      expect(t.phone.read(t.sent[1] ?? new Uint8Array(0))).toEqual({ type: "not-paired" });
      expect(t.wire.closed).toBe(true);
      expect(t.phones.connections[0]?.ended).toBe(true);
    });
  });

  describe("closing when the store fails", () => {
    it("still closes the wire, then throws, when ending the store's handle fails", async () => {
      const t = reconnected();
      t.phones.connected = () => ({
        end: () => {
          throw new Error("store failed");
        },
      });
      t.session.receive(t.phone.say(hello));
      await settle();
      expect(() => t.session.close()).toThrow("store failed");
      expect(t.wire.closed).toBe(true);
    });
  });

  describe("no cleartext path", () => {
    it.each([
      ["a gateway message before any handshake", encodeE2eFrame("message", new Uint8Array(32))],
      ["an unknown kind", Uint8Array.of(0x7f, 1, 2, 3)],
      ["an empty frame", new Uint8Array(0)],
      ["the host's own message 2", encodeE2eFrame("resume2", new Uint8Array(48))],
      ["a cleartext refusal", Uint8Array.of(0x30)],
    ])("closes on %s and sends nothing", (_name, frame) => {
      const t = openSecureSession();
      t.session.receive(frame);
      expect(t.sent).toEqual([]);
      expect(t.wire.closed).toBe(true);
    });

    it("closes on a second handshake inside an open session", () => {
      const t = reconnected();
      t.session.receive(t.phone.resume1(t.phones.host.publicKey));
      expect(t.wire.closed).toBe(true);
    });
  });

  describe("times", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("closes a handshake that hasn't ended 10 seconds after the connection started", () => {
      const t = openSecureSession();
      vi.advanceTimersByTime(gatewaySessionLimits.handshakeTimeoutMs - 1);
      expect(t.wire.closed).toBe(false);
      vi.advanceTimersByTime(1);
      expect(t.wire.closed).toBe(true);
    });

    it("closes an open session that doesn't say hello in time", () => {
      const t = reconnected({ helloTimeoutMs: 5_000 });
      vi.advanceTimersByTime(5_000);
      expect(t.wire.closed).toBe(true);
    });

    it("ends every session 24 hours after it opened", async () => {
      const t = reconnected();
      t.session.receive(t.phone.say(hello));
      await settle();
      vi.advanceTimersByTime(gatewaySessionLimits.sessionMaxMs - 1);
      expect(t.wire.closed).toBe(false);
      vi.advanceTimersByTime(1);
      expect(t.wire.closed).toBe(true);
    });

    it("rekeys a quiet session's sending key every 30 minutes, when it has used it", async () => {
      const t = reconnected();
      t.session.receive(t.phone.say(hello));
      await settle();
      vi.advanceTimersByTime(gatewaySessionLimits.rekeyAfterMs);
      expect(t.phone.read(t.sent[1] ?? new Uint8Array(0))).toMatchObject({ type: "welcome" });
      expect(t.phone.read(t.sent[2] ?? new Uint8Array(0))).toBe("rekey");
      vi.advanceTimersByTime(gatewaySessionLimits.rekeyAfterMs);
      expect(t.sent).toHaveLength(3);
    });
  });
});
