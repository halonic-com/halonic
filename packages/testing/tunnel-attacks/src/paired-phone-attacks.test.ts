import { readFile } from "node:fs/promises";
import { gatewayFrameKinds, gatewayMaxMessageBytes } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type HostRig, openHostRig } from "./host-rig.ts";
import { pairPhone } from "./pairing-steps.ts";
import { keyPair, RigPhone } from "./rig-phone.ts";
import { op, type WireClient, wireFrame } from "./wire-client.ts";

const hello = { type: "hello", id: "h1", version: 4 };
const welcome = {
  type: "welcome",
  replyTo: "h1",
  version: 4,
  maxMessageBytes: gatewayMaxMessageBytes,
};

/** Pairs a phone through the dialog and gives it as it reconnects, with its device id. */
async function pairedPhone(rig: HostRig): Promise<{ phone: RigPhone; id: string }> {
  const pairing = await rig.startPairing();
  const phone = (await pairPhone(rig, pairing)).reconnecting();
  const id = rig.phones.phones[0]?.id;
  if (id === undefined) throw new Error("no phone was paired");
  return { phone, id };
}

/** A client of `phone` that reconnected and said hello. */
async function greeted(rig: HostRig, phone: RigPhone): Promise<WireClient> {
  const client = await rig.opened();
  await client.reconnect(phone);
  client.sendJson(hello);
  expect(await client.frames(1)).toEqual([welcome]);
  return client;
}

/** The kind byte of every binary frame the host sent: anything but a session's frames would be cleartext. */
function kinds(client: WireClient): number[] {
  return client.hostFrames(op.binary).map((frame) => frame[0] ?? -1);
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

verifies("tunnel-attacks.paired-phone-attacks", () => {
  describe("a revoked phone (B6)", () => {
    it("is cut at once with an encrypted not-paired, and told the same, encrypted, when it reconnects", async () => {
      await onHost(async (rig) => {
        const { phone, id } = await pairedPhone(rig);
        const open = await greeted(rig, phone);
        await rig.control.revoke(id);
        expect(await open.frames(2)).toEqual([welcome, { type: "not-paired" }]);
        expect(await open.isClosed()).toBe(true);
        const again = await rig.opened();
        await again.reconnect(phone);
        expect(await again.frames(1)).toEqual([{ type: "not-paired" }]);
        expect(await again.isClosed()).toBe(true);
        expect(kinds(again)).toEqual([gatewayFrameKinds.resume2, gatewayFrameKinds.message]);
        expect(open.hostFrames(op.text)).toEqual([]);
        expect(rig.source.calls).toEqual([]);
      });
    });

    it("is never connected when it is revoked between the host's message 2 and its first message", async () => {
      await onHost(async (rig) => {
        const { phone, id } = await pairedPhone(rig);
        const client = await rig.opened();
        await client.reconnect(phone);
        await rig.control.revoke(id);
        client.sendJson(hello);
        expect(await client.frames(1)).toEqual([{ type: "not-paired" }]);
        expect(await client.isClosed()).toBe(true);
        expect(kinds(client)).toEqual([gatewayFrameKinds.resume2, gatewayFrameKinds.message]);
        expect(rig.phones.phones).toEqual([]);
        expect(rig.source.calls).toEqual([]);
      });
    });
  });

  describe("a changed host key (B12)", () => {
    it("ends as a cleartext handshake-failed, and removes or changes nothing the host keeps", async () => {
      await onHost(async (rig) => {
        const { phone } = await pairedPhone(rig);
        const before = await readFile(rig.storeFile, "utf8");
        const pinnedElsewhere = new RigPhone(keyPair().publicKey, phone.keys);
        const client = await rig.opened();
        client.write(wireFrame(op.binary, pinnedElsewhere.resume1()));
        expect(await client.isClosed()).toBe(true);
        expect(client.hostFrames(op.binary)).toEqual([
          Buffer.of(gatewayFrameKinds["handshake-failed"]),
        ]);
        expect(await readFile(rig.storeFile, "utf8")).toBe(before);
        expect(rig.phones.phones).toHaveLength(1);
        await greeted(rig, phone);
      });
    });
  });

  describe("the paired phones file", () => {
    it("holds the phones' public data only: no private key bytes, the phone's or the host's", async () => {
      await onHost(async (rig) => {
        const { phone } = await pairedPhone(rig);
        (await greeted(rig, phone)).end();
        const file = await fileOnceSeen(rig);
        const privateKeys = [phone.keys.privateKey, rig.hostKey.privateKey()];
        for (const key of privateKeys.map((bytes) => Buffer.from(bytes))) {
          for (const written of [key, ...["hex", "base64", "base64url"].map(encoded(key))]) {
            expect(file.includes(written)).toBe(false);
          }
        }
        const { phones } = JSON.parse(file.toString("utf8")) as { phones: object[] };
        expect(phones.map((stored) => Object.keys(stored).sort())).toEqual([
          ["id", "lastSeenAt", "name", "pairedAt", "platform", "publicKey"],
        ]);
      });
    });
  });
});

/** The paired phones file once the session that just ended wrote its phone's last seen. */
async function fileOnceSeen(rig: HostRig): Promise<Buffer> {
  for (let turn = 0; turn < 300; turn++) {
    const file = await readFile(rig.storeFile);
    if (file.includes("lastSeenAt")) return file;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("the phone's last seen was never written");
}

/** The key written as text in `encoding`. */
function encoded(key: Buffer): (encoding: string) => Buffer {
  return (encoding) => Buffer.from(key.toString(encoding as BufferEncoding));
}
