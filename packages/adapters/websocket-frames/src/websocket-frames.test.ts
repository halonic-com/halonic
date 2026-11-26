import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { encodeFrame, FrameReader, frameType } from "./websocket-frames.ts";

const mask = Uint8Array.of(0x12, 0x34, 0x56, 0x78);
const hello = Buffer.from('{"type":"live.hello","version":1}');

verifies("websocket-frames.client-frames", () => {
  describe("FrameReader for a server's frames", () => {
    it("reads an unmasked text frame, also when its bytes arrive one at a time", () => {
      const reader = new FrameReader(1000, "server");
      const events = [...encodeFrame(frameType.text, hello)].flatMap((byte) =>
        reader.push(Uint8Array.of(byte)),
      );
      expect(events).toEqual([{ kind: "message", binary: false, bytes: hello }]);
    });

    it("reads 16-bit and 64-bit lengths, pings, pongs and closes from one chunk", () => {
      const reader = new FrameReader(200_000, "server");
      const chunk = Buffer.concat([
        encodeFrame(frameType.binary, Buffer.alloc(300, 1)),
        encodeFrame(frameType.text, Buffer.alloc(70_000, 2)),
        encodeFrame(frameType.ping, Buffer.from("x")),
        encodeFrame(frameType.pong, Buffer.alloc(0)),
        encodeFrame(frameType.close, Buffer.from([0x03, 0xe8])),
      ]);
      expect(reader.push(chunk).map((event) => event.kind)).toEqual([
        "message",
        "message",
        "ping",
        "pong",
        "close",
      ]);
    });

    it("refuses a masked frame, as a server may not send one", () => {
      const reader = new FrameReader(1000, "server");
      expect(reader.push(encodeFrame(frameType.text, hello, mask))).toEqual([
        { kind: "protocol-error" },
      ]);
      expect(reader.push(encodeFrame(frameType.text, hello))).toEqual([]);
    });

    it("refuses a message over 1 MB from its header alone", () => {
      const limit = 1024 * 1024;
      const reader = new FrameReader(limit, "server");
      const header = encodeFrame(frameType.text, Buffer.alloc(limit + 1)).subarray(0, 10);
      expect(reader.push(header)).toEqual([{ kind: "too-large" }]);
      expect(reader.push(encodeFrame(frameType.text, hello))).toEqual([]);
    });
  });

  describe("encodeFrame with a mask", () => {
    it("writes a masked frame the gateway's reader reads back, for every length form", () => {
      for (const size of [5, 300, 70_000]) {
        const payload = Buffer.alloc(size, 0x61);
        const frame = encodeFrame(frameType.text, payload, mask);
        expect((frame[1] ?? 0) & 0x80).toBe(0x80);
        expect(new FrameReader(100_000, "client").push(frame)).toEqual([
          { kind: "message", binary: false, bytes: payload },
        ]);
      }
    });

    it("refuses a mask that isn't 4 bytes", () => {
      expect(() => encodeFrame(frameType.text, hello, Uint8Array.of(1, 2, 3))).toThrow(RangeError);
    });
  });
});
