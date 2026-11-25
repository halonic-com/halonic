import { pairingPsk } from "@halonicjs/adapter-e2e-noise";
import {
  gatewayFrameKinds,
  gatewayMaxFrameBytes,
  gatewayMaxHandshakeBytes,
  gatewayMaxMessageBytes,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type HostRig, openHostRig, rigHostName } from "./host-rig.ts";
import { PairingPhone } from "./pairing-phone.ts";
import { reachCheck, sendPair1, tryCode, wrongCode } from "./pairing-steps.ts";
import { keyPair, RigPhone } from "./rig-phone.ts";
import { openTunnelRig } from "./tunnel-rig.ts";
import { op, type WireClient, wireFrame } from "./wire-client.ts";

const hello = { type: "hello", id: "h1", version: 4 };

/** Runs `attack` on a fresh host rig and stops the rig afterwards. */
async function onHost(attack: (rig: HostRig) => Promise<void>): Promise<void> {
  const rig = await openHostRig();
  try {
    await attack(rig);
  } finally {
    await rig.stop();
  }
}

/** A binary frame of `kind` with `body` after the kind byte. */
function binary(kind: number, body: Uint8Array): Buffer {
  return wireFrame(op.binary, Buffer.concat([Buffer.of(kind), body]));
}

/** Sends `frames` on a new connection and gives every binary frame the host sent before it closed. */
async function answersTo(rig: HostRig, frames: readonly Buffer[]): Promise<Buffer[]> {
  const client = await rig.opened();
  for (const frame of frames) client.write(frame);
  expect(await client.isClosed()).toBe(true);
  expect(client.hostFrames(op.text)).toEqual([]);
  return client.hostFrames(op.binary);
}

/** Text split into groups of `size`, joined by `separator`, as a person might copy a code. */
function grouped(text: string, size: number, separator: string): string {
  return (text.match(new RegExp(`.{1,${size}}`, "g")) ?? []).join(separator);
}

/** Every way the pairing code and the check code could be written: as shown, grouped, lower case, as the QR's bytes and as the psk. */
function writtenForms(code: string, checkCode: string, qrText: string): Buffer[] {
  const texts = [code, grouped(code, 4, "-"), grouped(code, 4, " ")];
  texts.push(checkCode, grouped(checkCode, 3, "-"), grouped(checkCode, 3, " "));
  const record = Buffer.from(qrText.slice(qrText.indexOf(":") + 1), "base64url");
  // The QR record: a version byte, the 32-byte host key, then the code in 8 bytes.
  const codeBytes = record.subarray(33, 41);
  const asText = texts
    .flatMap((text) => [text, text.toLowerCase()])
    .map((text) => Buffer.from(text));
  return [...asText, codeBytes, Buffer.from(pairingPsk(code))];
}

/** A paired-phone client that did the reconnect and said nothing yet. */
async function inSession(): Promise<{ client: WireClient; stop: () => Promise<void> }> {
  const rig = await openTunnelRig();
  const client = rig.client();
  await client.open(rig.forwarderPort, { host: rig.tunnelName });
  await client.reconnect(rig.phones.pairPhone());
  return { client, stop: () => rig.stop() };
}

verifies("tunnel-attacks.handshake-attacks", () => {
  describe("the pairing code and the check code", () => {
    it("never appear in a frame the host sends, in pair-refused, in the host's log or in the mDNS records", async () => {
      await onHost(async (rig) => {
        const pairing = await rig.startPairing();
        const qr = await pairing.qr();
        expect(await tryCode(rig, wrongCode(qr))).toMatchObject({ reason: "wrong-code" });
        const { phone, client } = await reachCheck(rig, pairing);
        await pairing.session.allow();
        await client.binaryFrame(1);
        const shown = await pairing.event("code");
        const forms = writtenForms(qr.code, phone.checkCode(), shown.qr);
        const wire = Buffer.concat(rig.wire);
        const places = { wire, log: Buffer.from(rig.logged.join("")), mdns: rig.multicast };
        for (const form of forms) {
          expect(wire.includes(form), form.toString("hex")).toBe(false);
          expect(places.log.includes(form)).toBe(false);
          for (const datagram of places.mdns)
            expect(Buffer.from(datagram).includes(form)).toBe(false);
        }
        // The advert ran, and its TXT record carries the computer's name and nothing more.
        expect(places.mdns.some((datagram) => Buffer.from(datagram).includes(rigHostName))).toBe(
          true,
        );
        // A refusal is three bytes: its kind, its reason and the tries left.
        const pairRefused = (await sendPair1(rig, new PairingPhone(qr))).client.hostFrames(
          op.binary,
        );
        expect(pairRefused.map((frame) => frame.length)).toEqual([3]);
      });
    });
  });

  describe("cleartext and downgrade paths (B11)", () => {
    it("closes, answering nothing, on a v1 hello in the clear and on a message or a host's frame with no handshake", async () => {
      await onHost(async (rig) => {
        const v1 = Buffer.from(JSON.stringify({ ...hello, version: 1 }));
        const noHandshake = [
          [wireFrame(op.text, v1)],
          [wireFrame(op.binary, v1)],
          [binary(gatewayFrameKinds.message, Buffer.alloc(64, 7))],
          [binary(gatewayFrameKinds.rekey, Buffer.alloc(16))],
          [binary(gatewayFrameKinds.pair2, Buffer.alloc(96, 1))],
          [binary(gatewayFrameKinds.resume2, Buffer.alloc(48, 1))],
          [binary(gatewayFrameKinds["pair-refused"], Buffer.of(0, 4))],
        ];
        for (const frames of noHandshake) expect(await answersTo(rig, frames)).toEqual([]);
        expect(rig.source.calls).toEqual([]);
      });
    });

    it("counts no try for a message 3 with no message 1 before it, and answers it with nothing", async () => {
      await onHost(async (rig) => {
        const pairing = await rig.startPairing();
        const qr = await pairing.qr();
        const skipped = new PairingPhone(qr);
        const started = await sendPair1(rig, skipped);
        const message3 = binary(gatewayFrameKinds.pair3, skipped.pair3().subarray(1));
        started.client.end();
        await rig.time.advance(60_000);
        expect(await answersTo(rig, [message3])).toEqual([]);
        // The dropped handshake above was one wrong try; the lone message 3 was none.
        expect(await tryCode(rig, wrongCode(qr))).toMatchObject({ triesLeft: 3 });
      });
    });

    it("never opens a session or pairs on a pattern swap: a reconnect's message 1 as a pairing's, and the other way", async () => {
      await onHost(async (rig) => {
        const pairing = await rig.startPairing();
        const qr = await pairing.qr();
        const reconnect = new RigPhone(qr.hostKey, keyPair()).resume1();
        const asPairing = binary(gatewayFrameKinds.pair1, reconnect.subarray(1));
        expect(await answersTo(rig, [asPairing])).toEqual([]);
        const pairing1 = new PairingPhone(qr).pair1();
        const asReconnect = binary(gatewayFrameKinds.resume1, pairing1.subarray(1));
        const answers = await answersTo(rig, [asReconnect]);
        expect(answers).toEqual([Buffer.of(gatewayFrameKinds["handshake-failed"])]);
        // Neither was a try: the code still has all five.
        expect(await tryCode(rig, wrongCode(qr))).toMatchObject({ triesLeft: 4 });
        expect(rig.phones.phones).toEqual([]);
      });
    });
  });

  describe("oversized frames", () => {
    it("reads a handshake message at its limit, and closes, answering nothing and counting no try, on one a byte over", async () => {
      await onHost(async (rig) => {
        const atLimit = Buffer.alloc(gatewayMaxHandshakeBytes, 1);
        const tooLong = Buffer.alloc(gatewayMaxHandshakeBytes + 1, 1);
        // With no code open, a message 1 the host reads gets its refusal; only the size check stops it earlier.
        const [refusal] = await answersTo(rig, [binary(gatewayFrameKinds.pair1, atLimit)]);
        expect(refusal?.[0]).toBe(gatewayFrameKinds["pair-refused"]);
        // A reconnect's message 1 that doesn't decrypt gets handshake-failed when it's read.
        expect(await answersTo(rig, [binary(gatewayFrameKinds.resume1, atLimit)])).toEqual([
          Buffer.of(gatewayFrameKinds["handshake-failed"]),
        ]);
        for (const kind of [gatewayFrameKinds.pair1, gatewayFrameKinds.resume1]) {
          expect(await answersTo(rig, [binary(kind, tooLong)])).toEqual([]);
        }
        const pairing = await rig.startPairing();
        const qr = await pairing.qr();
        expect(await answersTo(rig, [binary(gatewayFrameKinds.pair1, tooLong)])).toEqual([]);
        expect(await tryCode(rig, wrongCode(qr))).toMatchObject({ triesLeft: 4 });
      });
    });

    it("reads a message of exactly 65,519 bytes in the session, and closes on a frame announcing one byte more, before its body", async () => {
      const largest = Buffer.from(JSON.stringify(hello).padEnd(gatewayMaxMessageBytes, " "));
      const fits = await inSession();
      try {
        fits.client.sendText(largest);
        expect(await fits.client.frames(1)).toMatchObject([{ type: "welcome" }]);
      } finally {
        await fits.stop();
      }
      const over = await inSession();
      try {
        const sealed = over.client.phone?.seal(largest) ?? Buffer.alloc(0);
        expect(sealed.length).toBe(gatewayMaxFrameBytes);
        // Only the header and mask of a frame one byte over: a host that waited for the body would stay open.
        const oneOver = wireFrame(op.binary, Buffer.alloc(gatewayMaxFrameBytes + 1));
        over.client.write(oneOver.subarray(0, oneOver.length - (gatewayMaxFrameBytes + 1)));
        expect(await over.client.isClosed()).toBe(true);
        expect(over.client.textFrames()).toEqual([]);
      } finally {
        await over.stop();
      }
    });
  });
});
