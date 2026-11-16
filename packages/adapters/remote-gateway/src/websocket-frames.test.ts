import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { clientFrame, op } from "./listener.test-helper.ts";
import { encodeFrame, FrameReader, frameType } from "./websocket-frames.ts";

const hello = Buffer.from('{"type":"list-sessions","id":"l"}');

verifies("remote-gateway.websocket-frames", () => {
  describe("FrameReader", () => {
    it("reads a masked text frame, also when its bytes arrive one at a time", () => {
      const reader = new FrameReader(1000);
      const events = [...clientFrame(op.text, hello)].flatMap((byte) =>
        reader.push(Uint8Array.of(byte)),
      );
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ kind: "message", binary: false });
      expect(Buffer.from((events[0] as { bytes: Uint8Array }).bytes)).toEqual(hello);
    });

    it("reads a large frame that arrives in many chunks", () => {
      const payload = Buffer.alloc(900, 7);
      const frame = clientFrame(op.binary, payload);
      const reader = new FrameReader(1000);
      const events = [];
      for (let at = 0; at < frame.length; at += 50)
        events.push(...reader.push(frame.subarray(at, at + 50)));
      expect(events).toEqual([{ kind: "message", binary: true, bytes: payload }]);
    });

    it("reads several frames from one chunk, with 16-bit and 64-bit lengths", () => {
      const reader = new FrameReader(200_000);
      const medium = Buffer.alloc(300, 0x61);
      const large = Buffer.alloc(70_000, 0x62);
      const chunk = Buffer.concat([
        clientFrame(op.binary, medium),
        clientFrame(op.text, large),
        clientFrame(op.ping, Buffer.from("x")),
      ]);
      const kinds = reader.push(chunk).map((event) => event.kind);
      expect(kinds).toEqual(["message", "message", "ping"]);
    });

    it("tells ping, pong and close apart", () => {
      const reader = new FrameReader(1000);
      const pong = clientFrame(0xa, Buffer.alloc(0));
      expect(
        reader
          .push(Buffer.concat([pong, clientFrame(op.close, Buffer.alloc(0))]))
          .map((e) => e.kind),
      ).toEqual(["pong", "close"]);
    });

    it("refuses a message that declares more than the limit from its header alone", () => {
      const reader = new FrameReader(1000);
      const header = clientFrame(op.text, Buffer.alloc(1001)).subarray(0, 8);
      expect(reader.push(header)).toEqual([{ kind: "too-large" }]);
      expect(reader.push(clientFrame(op.text, hello))).toEqual([]);
    });

    it("refuses a 64-bit length beyond any limit without trying to hold it", () => {
      const header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 0xff;
      header.writeBigUInt64BE(2n ** 63n, 2);
      expect(new FrameReader(1000).push(header)).toEqual([{ kind: "too-large" }]);
    });

    it("refuses what a client may not send", () => {
      const bad = [
        clientFrame(op.text, hello, { mask: false }),
        clientFrame(op.text, hello, { fin: false }),
        clientFrame(0x0, hello),
        clientFrame(0x3, hello),
        clientFrame(op.ping, Buffer.alloc(126)),
        Buffer.concat([Buffer.from([0xc1]), clientFrame(op.text, hello).subarray(1)]),
      ];
      for (const frame of bad) {
        expect(new FrameReader(1000).push(frame)).toEqual([{ kind: "protocol-error" }]);
      }
    });
  });

  describe("encodeFrame", () => {
    it("writes an unmasked frame with a short, 16-bit or 64-bit length", () => {
      expect([...encodeFrame(frameType.text, Buffer.from("hi"))]).toEqual([0x81, 2, 0x68, 0x69]);
      expect(encodeFrame(frameType.text, Buffer.alloc(300)).subarray(0, 4)).toEqual(
        Buffer.from([0x81, 126, 1, 44]),
      );
      const large = encodeFrame(frameType.binary, Buffer.alloc(70_000));
      expect(large.subarray(0, 2)).toEqual(Buffer.from([0x82, 127]));
      expect(large.readBigUInt64BE(2)).toBe(70_000n);
    });
  });
});
