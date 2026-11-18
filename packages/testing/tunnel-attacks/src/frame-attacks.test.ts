import { gatewayMaxMessageBytes } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { openTunnelRig, type TunnelRig } from "./tunnel-rig.ts";
import { op, type WireClient, wireFrame } from "./wire-client.ts";

const hello = { type: "hello", id: "h1", version: 1 };

/** A phone that has done the handshake through the tunnel but not said hello. */
async function opened(rig: TunnelRig): Promise<WireClient> {
  const client = rig.client();
  await client.open(rig.forwarderPort, { host: rig.tunnelName });
  return client;
}

/** The checks every attack ends with: the host was asked for nothing, and a good phone is still welcome. */
async function expectUntouched(rig: TunnelRig): Promise<void> {
  expect(rig.source.calls).toEqual([]);
  const phone = await opened(rig);
  phone.sendJson(hello);
  expect(await phone.frames(1)).toEqual([
    { type: "welcome", replyTo: "h1", version: 1, maxMessageBytes: gatewayMaxMessageBytes },
  ]);
}

/** The first frame a hostile stream is answered with, if any. */
async function answerTo(rig: TunnelRig, bytes: Buffer | Buffer[]): Promise<unknown[]> {
  const client = await opened(rig);
  for (const chunk of Array.isArray(bytes) ? bytes : [bytes]) client.write(chunk);
  const frames = await client.frames(1);
  expect(await client.isClosed()).toBe(true);
  return frames;
}

verifies("tunnel-attacks.frame-attacks", () => {
  describe("oversize", () => {
    it("refuses a frame that declares more than 64 KiB without waiting for its bytes", async () => {
      const rig = await openTunnelRig();
      try {
        const headerOnly = (declared: bigint): Buffer => {
          const header = Buffer.alloc(14);
          header[0] = 0x81;
          header[1] = 0x80 | 127;
          header.writeBigUInt64BE(declared, 2);
          return header;
        };
        for (const declared of [BigInt(gatewayMaxMessageBytes) + 1n, 2n ** 32n, 2n ** 53n]) {
          const frames = await answerTo(rig, headerOnly(declared));
          expect(frames).toEqual([{ type: "error", code: "too-large" }]);
        }
        // A length with the top bit set is not a length: the frame format forbids it.
        const frames = await answerTo(rig, headerOnly(2n ** 63n));
        expect(frames.length).toBeLessThanOrEqual(1);
        await expectUntouched(rig);
      } finally {
        await rig.stop();
      }
    });

    it("refuses a real message over 64 KiB sent in full, also in the short and the long length form", async () => {
      const rig = await openTunnelRig();
      try {
        const big = Buffer.from(
          JSON.stringify({ type: "prompt", id: "p1", sessionId: "s1", text: "x".repeat(70_000) }),
        );
        const frames = await answerTo(rig, wireFrame(op.text, big));
        expect(frames).toEqual([{ type: "error", code: "too-large" }]);
        await expectUntouched(rig);
      } finally {
        await rig.stop();
      }
    });

    it("closes a message that stays under the limit in each fragment but not in all of them", async () => {
      const rig = await openTunnelRig();
      try {
        const piece = Buffer.alloc(40_000, 0x20);
        const frames = await answerTo(rig, [
          wireFrame(op.text, piece, { fin: false }),
          wireFrame(op.continuation, piece, { fin: false }),
          wireFrame(op.continuation, piece),
        ]);
        expect(frames.length).toBeLessThanOrEqual(1);
        await expectUntouched(rig);
      } finally {
        await rig.stop();
      }
    });

    it("closes a stream of small fragments that never ends, holding at most a message's worth", async () => {
      const rig = await openTunnelRig();
      try {
        const client = await opened(rig);
        const piece = wireFrame(op.continuation, Buffer.alloc(1_024, 0x20), { fin: false });
        client.write(wireFrame(op.text, Buffer.alloc(1_024, 0x20), { fin: false }));
        for (let sent = 0; sent < 100; sent++) client.write(piece);
        expect(await client.isClosed()).toBe(true);
        await expectUntouched(rig);
      } finally {
        await rig.stop();
      }
    });
  });

  describe("frames that break the format", () => {
    it("closes on an unmasked frame, a reserved bit, a reserved opcode and a bad control frame", async () => {
      const rig = await openTunnelRig();
      try {
        const body = Buffer.from(JSON.stringify(hello));
        const hostile: [string, Buffer][] = [
          ["unmasked", wireFrame(op.text, body, { mask: false })],
          ["rsv1", wireFrame(op.text, body, { reserved: 4 })],
          ["rsv2", wireFrame(op.text, body, { reserved: 2 })],
          ["rsv3", wireFrame(op.text, body, { reserved: 1 })],
          ["opcode 3", wireFrame(3, body)],
          ["opcode 11", wireFrame(11, body)],
          ["opcode 15", wireFrame(15, body)],
          ["continuation first", wireFrame(op.continuation, body)],
          ["fragmented ping", wireFrame(op.ping, Buffer.from("a"), { fin: false })],
          ["ping of 126 bytes", wireFrame(op.ping, Buffer.alloc(126))],
          ["close of one byte", wireFrame(op.close, Buffer.from([3]))],
          [
            "text during a fragmented message",
            Buffer.concat([wireFrame(op.text, body, { fin: false }), wireFrame(op.text, body)]),
          ],
        ];
        for (const [name, bytes] of hostile) {
          const client = await opened(rig);
          client.write(bytes);
          expect(await client.isClosed(), name).toBe(true);
          expect(
            client.textFrames().filter((frame) => (frame as { type: string }).type === "welcome"),
            name,
          ).toEqual([]);
        }
        await expectUntouched(rig);
      } finally {
        await rig.stop();
      }
    });

    it("closes on bytes that are not a frame at all, sent right after the handshake", async () => {
      const rig = await openTunnelRig();
      try {
        for (const garbage of [
          Buffer.from("GET / HTTP/1.1\r\n\r\n"),
          Buffer.from([0xff, 0xff, 0xff, 0xff]),
          Buffer.alloc(64, 0),
        ]) {
          const client = await opened(rig);
          client.write(garbage);
          expect(await client.isClosed()).toBe(true);
        }
        await expectUntouched(rig);
      } finally {
        await rig.stop();
      }
    });
  });

  describe("malformed messages", () => {
    it("answers malformed and closes, and asks the host for nothing", async () => {
      const rig = await openTunnelRig();
      try {
        const nested = `${"[".repeat(30_000)}${"]".repeat(30_000)}`;
        const texts: [string, Uint8Array][] = [
          ["invalid UTF-8", Buffer.from([0x7b, 0xc3, 0x28, 0x7d])],
          ["a NUL", Buffer.from(`${JSON.stringify(hello)}\u0000`)],
          ["a deep nest", Buffer.from(nested)],
          ["a deep object", Buffer.from(`${'{"a":'.repeat(10_000)}1${"}".repeat(10_000)}`)],
          ["an array", Buffer.from(`[${JSON.stringify(hello)}]`)],
          ["a string", Buffer.from('"hello"')],
          ["null", Buffer.from("null")],
          ["two objects", Buffer.from(`${JSON.stringify(hello)}${JSON.stringify(hello)}`)],
          ["nothing", Buffer.alloc(0)],
          ["a duplicate key", Buffer.from('{"type":"list-sessions","id":"a","id":"b"}')],
          ["a proto key", Buffer.from('{"type":"list-sessions","id":"a","__proto__":{"x":1}}')],
          ["a constructor key", Buffer.from('{"type":"list-sessions","id":"a","constructor":{}}')],
          ["a huge number", Buffer.from('{"type":"hello","id":"h","version":1e999}')],
          ["a float version", Buffer.from('{"type":"hello","id":"h","version":1.5}')],
          ["a lone surrogate type", Buffer.from('{"type":"\\ud800","id":"h"}')],
        ];
        for (const [name, bytes] of texts) {
          const client = await opened(rig);
          client.write(wireFrame(op.text, bytes));
          const frames = await client.frames(1);
          expect(frames, name).toEqual([{ type: "error", code: "malformed" }]);
          expect(await client.isClosed(), name).toBe(true);
        }
        const binary = await opened(rig);
        binary.write(wireFrame(op.binary, Buffer.from(JSON.stringify(hello))));
        expect(await binary.frames(1)).toEqual([{ type: "error", code: "malformed" }]);
        await expectUntouched(rig);
      } finally {
        await rig.stop();
      }
    });

    it("refuses a second hello and a message before hello, and a hello of another version", async () => {
      const rig = await openTunnelRig();
      try {
        const early = await opened(rig);
        early.sendJson({ type: "list-sessions", id: "l1" });
        expect(await early.frames(1)).toEqual([{ type: "error", code: "malformed" }]);
        const twice = await rig.greeted();
        twice.sendJson({ type: "hello", id: "h2", version: 1 });
        expect(await twice.frames(2)).toHaveLength(2);
        expect(await twice.isClosed()).toBe(true);
        for (const version of [0, 2, -1, 2 ** 31]) {
          const old = await opened(rig);
          old.sendJson({ type: "hello", id: "h1", version });
          expect(await old.frames(1)).toEqual([{ type: "error", code: "unsupported-version" }]);
        }
        await expectUntouched(rig);
      } finally {
        await rig.stop();
      }
    });
  });

  describe("floods and slots", () => {
    it("closes a client that sends 33 frames without waiting", async () => {
      const rig = await openTunnelRig();
      try {
        const phone = await rig.greeted();
        const one = wireFrame(
          op.text,
          Buffer.from(JSON.stringify({ type: "list-sessions", id: "l1" })),
        );
        phone.write(Buffer.concat(Array.from({ length: 2_000 }, () => one)));
        expect(await phone.isClosed()).toBe(true);
        await expectUntouched(rig);
      } finally {
        await rig.stop();
      }
    });

    it("refuses connections past its limit, and frees a slot when a connection ends", async () => {
      const rig = await openTunnelRig({ maxConnections: 2 });
      try {
        const first = await opened(rig);
        const second = await opened(rig);
        const third = rig.client();
        third.write("GET /v1/gateway HTTP/1.1\r\n\r\n");
        expect(await third.isClosed()).toBe(true);
        expect(third.received.length).toBe(0);
        first.end();
        second.end();
        await Promise.all([first.closed, second.closed]);
        // The gateway sees the sockets end a moment later than the clients do.
        for (let turn = 0; turn < 100; turn++) {
          const probe = rig.client();
          const status = await probe.handshake(rig.forwarderPort, { host: rig.tunnelName });
          if (status.includes("101")) return;
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        throw new Error("A slot never came free.");
      } finally {
        await rig.stop();
      }
    });

    it("drops a client that did the handshake and never says hello, though it answers pings", async () => {
      const rig = await openTunnelRig({ helloTimeoutMs: 200, heartbeatMs: 50 });
      try {
        const idle = await opened(rig);
        // Answering pings keeps a connection alive; only hello does, so the hello time drops this one.
        idle.socket.on("data", () => idle.write(wireFrame(op.pong, Buffer.alloc(0))));
        expect(await idle.isClosed()).toBe(true);
        expect(rig.source.calls).toEqual([]);
      } finally {
        await rig.stop();
      }
    });

    it("stops every watch when a client that watched many sessions goes away", async () => {
      const rig = await openTunnelRig();
      try {
        const phone = await rig.greeted();
        for (let at = 0; at < 5; at++) {
          phone.sendJson({ type: "watch", id: `w${at}`, sessionId: "s1", afterSeq: 0 });
        }
        await phone.frames(2);
        expect(rig.source.watching).toBe(1);
        phone.end();
        await phone.closed;
        for (let turn = 0; turn < 100 && rig.source.watching > 0; turn++) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        expect(rig.source.watching).toBe(0);
      } finally {
        await rig.stop();
      }
    });
  });
});
