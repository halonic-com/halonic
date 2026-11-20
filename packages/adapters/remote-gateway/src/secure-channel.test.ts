import { NoiseSession } from "@halonicjs/adapter-e2e-noise";
import { gatewayMaxMessageBytes, gatewaySessionLimits } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeE2eFrame, readE2eFrame } from "./e2e-frames.ts";
import { keyPair } from "./e2e-phone.test-helper.ts";
import { SecureChannel } from "./secure-channel.ts";

const { rekeyAfterMessages, rekeyAfterMs } = gatewaySessionLimits;
const word = new TextEncoder().encode("{}");

/** A host channel and the phone's Noise session at the other end, after a reconnect handshake. */
function channelPair() {
  const host = keyPair();
  const phone = keyPair();
  const initiator = NoiseSession.start({
    handshake: "reconnect",
    role: "initiator",
    localPrivateKey: phone.privateKey,
    remotePublicKey: host.publicKey,
  });
  const responder = NoiseSession.start({
    handshake: "reconnect",
    role: "responder",
    localPrivateKey: host.privateKey,
  });
  responder.readMessage(initiator.writeMessage(new Uint8Array(0)));
  initiator.readMessage(responder.writeMessage(new Uint8Array(0)));
  const sent: Uint8Array[] = [];
  const wire = {
    send: (frame: Uint8Array) => sent.push(frame),
    bufferedBytes: () => 0,
    close: () => undefined,
  };
  return { channel: new SecureChannel(responder, wire), phone: initiator, sent };
}

/** What the phone makes of the host's frames: "message" or "rekey", rekeying as it goes. */
function phoneReads(phone: NoiseSession, frames: readonly Uint8Array[]): string[] {
  return frames.map((bytes) => {
    const frame = readE2eFrame(bytes);
    if (frame === undefined) throw new Error("not a frame");
    phone.readMessage(frame.body);
    if (frame.kind === "rekey") phone.rekeyIncoming();
    return frame.kind;
  });
}

verifies("remote-gateway.e2e-session", () => {
  describe("rekeying", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("sends a rekey frame before the 10,001st message under one key, and the phone reads on", () => {
      const t = channelPair();
      for (let count = 0; count <= rekeyAfterMessages; count++) t.channel.send(word);
      const kinds = phoneReads(t.phone, t.sent);
      expect(kinds.filter((kind) => kind === "rekey")).toHaveLength(1);
      expect(kinds.indexOf("rekey")).toBe(rekeyAfterMessages);
      expect(kinds).toHaveLength(rekeyAfterMessages + 2);
    });

    it("rekeys before sending once 30 minutes have passed", () => {
      vi.useFakeTimers();
      const t = channelPair();
      t.channel.send(word);
      vi.advanceTimersByTime(rekeyAfterMs);
      t.channel.send(word);
      expect(phoneReads(t.phone, t.sent)).toEqual(["message", "rekey", "message"]);
    });

    it("rekeys a used key on request, and leaves an unused one", () => {
      const t = channelPair();
      t.channel.rekeyIfUsed();
      expect(t.sent).toEqual([]);
      t.channel.send(word);
      t.channel.rekeyIfUsed();
      expect(phoneReads(t.phone, t.sent)).toEqual(["message", "rekey"]);
    });

    it("rekeys its receiving key on a rekey frame and breaks on the 10,001st message without one", () => {
      const t = channelPair();
      const say = () =>
        t.channel.receive({ kind: "message", body: t.phone.writeMessage(word) }).kind;
      for (let count = 0; count < rekeyAfterMessages; count++) expect(say()).toBe("message");
      expect(
        t.channel.receive({ kind: "rekey", body: t.phone.writeMessage(new Uint8Array(0)) }),
      ).toEqual({
        kind: "rekeyed",
      });
      t.phone.rekeyOutgoing();
      for (let count = 0; count < rekeyAfterMessages; count++) expect(say()).toBe("message");
      expect(say()).toBe("broken");
    });

    it("breaks on a rekey frame that carries a payload", () => {
      const t = channelPair();
      expect(t.channel.receive({ kind: "rekey", body: t.phone.writeMessage(word) }).kind).toBe(
        "broken",
      );
    });
  });

  describe("transport frames", () => {
    it("breaks on a message that doesn't decrypt and on a handshake frame", () => {
      const t = channelPair();
      expect(t.channel.receive({ kind: "message", body: new Uint8Array(40) }).kind).toBe("broken");
      const other = channelPair();
      const frame = readE2eFrame(encodeE2eFrame("pair3", other.phone.writeMessage(word)));
      expect(frame && other.channel.receive(frame).kind).toBe("broken");
    });

    it("refuses to send a message over 65,519 bytes", () => {
      const t = channelPair();
      expect(() => t.channel.send(new Uint8Array(gatewayMaxMessageBytes + 1))).toThrow(RangeError);
      t.channel.send(new Uint8Array(gatewayMaxMessageBytes));
      expect(t.sent).toHaveLength(1);
    });
  });
});
