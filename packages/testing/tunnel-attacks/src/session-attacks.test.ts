import { gatewayFrameKinds } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { keyPair, RigPhone } from "./rig-phone.ts";
import { openTunnelRig, type TunnelRig } from "./tunnel-rig.ts";
import { op, type WireClient, wireFrame } from "./wire-client.ts";

const hello = Buffer.from(JSON.stringify({ type: "hello", id: "h1", version: 2 }));

/** A client that has opened the WebSocket through the tunnel, before any end-to-end handshake. */
async function opened(rig: TunnelRig): Promise<WireClient> {
  const client = rig.client();
  await client.open(rig.forwarderPort, { host: rig.tunnelName });
  return client;
}

/** Waits for the connection to end, and gives every binary frame the host sent on it. */
async function closedWith(client: WireClient): Promise<Buffer[]> {
  expect(await client.isClosed()).toBe(true);
  return client.hostFrames(op.binary);
}

verifies("tunnel-attacks.session-attacks", () => {
  describe("a phone that isn't paired (B1)", () => {
    it("is told not-paired only inside the session, after the host proved itself, and gets nothing else", async () => {
      const rig = await openTunnelRig();
      try {
        const stranger = new RigPhone(rig.phones.host.publicKey);
        const client = await opened(rig);
        client.write(wireFrame(op.binary, stranger.resume1()));
        const frames = await closedWith(client);
        expect(frames.map((frame) => frame[0])).toEqual([
          gatewayFrameKinds.resume2,
          gatewayFrameKinds.message,
        ]);
        expect(stranger.read(frames[0] ?? Buffer.alloc(0))).toBe("resume2");
        const answer = stranger.read(frames[1] ?? Buffer.alloc(0));
        expect(JSON.parse(Buffer.from(answer as Uint8Array).toString("utf8"))).toEqual({
          type: "not-paired",
        });
        expect(rig.source.calls).toEqual([]);
      } finally {
        await rig.stop();
      }
    });
  });

  describe("a replayed or reordered handshake or frame (B8)", () => {
    it("never lets a replay of a paired phone's handshake and hello in", async () => {
      const rig = await openTunnelRig();
      try {
        const phone = rig.phones.pairPhone();
        const message1 = phone.resume1();
        const real = await opened(rig);
        real.write(wireFrame(op.binary, message1));
        await real.until(() => real.hostFrames(op.binary).length > 0);
        phone.read(real.hostFrames(op.binary)[0] ?? Buffer.alloc(0));
        const sealedHello = phone.seal(hello);
        real.end();
        const replay = await opened(rig);
        replay.write(wireFrame(op.binary, message1));
        replay.write(wireFrame(op.binary, sealedHello));
        const frames = await closedWith(replay);
        // Message 2 goes out, as to anyone with message 1, but the replayed hello can't decrypt under the new keys.
        expect(frames.map((frame) => frame[0])).toEqual([gatewayFrameKinds.resume2]);
        expect(rig.source.calls).toEqual([]);
      } finally {
        await rig.stop();
      }
    });

    it("closes on two messages that arrive in the wrong order", async () => {
      const rig = await openTunnelRig();
      try {
        const client = await rig.greeted();
        const first = client.phone?.seal(Buffer.from('{"type":"list-sessions","id":"l1"}'));
        const second = client.phone?.seal(Buffer.from('{"type":"list-sessions","id":"l2"}'));
        client.write(wireFrame(op.binary, second ?? Buffer.alloc(0)));
        client.write(wireFrame(op.binary, first ?? Buffer.alloc(0)));
        expect(await client.isClosed()).toBe(true);
        expect(rig.source.calls).toEqual([]);
      } finally {
        await rig.stop();
      }
    });
  });

  describe("a downgrade to no end-to-end encryption (B11)", () => {
    it("answers no protocol message sent in the clear, before or after the handshake", async () => {
      const rig = await openTunnelRig();
      try {
        const attempts: ((client: WireClient) => Promise<void>)[] = [
          async (client) => client.write(wireFrame(op.text, hello)),
          async (client) => client.write(wireFrame(op.binary, hello)),
          async (client) =>
            client.write(wireFrame(op.binary, Buffer.concat([Buffer.of(0x20), hello]))),
          async (client) => {
            await client.reconnect(rig.phones.pairPhone());
            client.write(wireFrame(op.text, hello));
          },
        ];
        for (const attempt of attempts) {
          const client = await opened(rig);
          await attempt(client);
          expect(await client.isClosed()).toBe(true);
          expect(client.hostFrames(op.text)).toEqual([]);
          expect(client.textFrames()).toEqual([]);
        }
        expect(rig.source.calls).toEqual([]);
      } finally {
        await rig.stop();
      }
    });
  });

  describe("a changed host key (B12)", () => {
    it("is answered only with a cleartext handshake-failed, never not-paired and never message 2", async () => {
      const rig = await openTunnelRig();
      try {
        const pinnedElsewhere = new RigPhone(keyPair().publicKey);
        const client = await opened(rig);
        client.write(wireFrame(op.binary, pinnedElsewhere.resume1()));
        const frames = await closedWith(client);
        expect(frames).toEqual([Buffer.of(gatewayFrameKinds["handshake-failed"])]);
      } finally {
        await rig.stop();
      }
    });
  });
});
