import { describe, expect, it } from "vitest";
import {
  encodeFrame,
  FrameDecoder,
  FrameKind,
  FrameStreamError,
  maxFrameBytes,
} from "./frame-codec.ts";

describe("encodeFrame", () => {
  it("writes the id, the kind and the length in big-endian order, then the bytes", () => {
    const frame = encodeFrame(0x01020304, FrameKind.data, Buffer.from("hi"));
    expect([...frame]).toEqual([1, 2, 3, 4, 2, 0, 0, 0, 2, 0x68, 0x69]);
  });

  it("writes a frame without bytes with length 0", () => {
    expect([...encodeFrame(7, FrameKind.end)]).toEqual([0, 0, 0, 7, 3, 0, 0, 0, 0]);
  });

  it("numbers the kinds open 1, data 2, end 3 and reset 4", () => {
    expect(FrameKind).toEqual({ open: 1, data: 2, end: 3, reset: 4 });
  });

  it("refuses more bytes than one frame carries", () => {
    expect(() => encodeFrame(1, FrameKind.data, Buffer.alloc(maxFrameBytes + 1))).toThrow(
      RangeError,
    );
  });
});

describe("FrameDecoder", () => {
  it("reads back what encodeFrame wrote, a full-length frame included", () => {
    const full = Buffer.alloc(maxFrameBytes, 0x61);
    const stream = Buffer.concat([
      encodeFrame(1, FrameKind.open),
      encodeFrame(1, FrameKind.data, full),
      encodeFrame(1, FrameKind.reset),
    ]);
    const frames = new FrameDecoder().push(stream);
    expect(frames.map((frame) => [frame.connection, frame.kind, frame.bytes.length])).toEqual([
      [1, FrameKind.open, 0],
      [1, FrameKind.data, maxFrameBytes],
      [1, FrameKind.reset, 0],
    ]);
    expect(frames[1]?.bytes.equals(full)).toBe(true);
  });

  it("puts frames back together however the chunks split them", () => {
    const stream = Buffer.concat([
      encodeFrame(3, FrameKind.data, Buffer.from("hello")),
      encodeFrame(4, FrameKind.end),
    ]);
    const decoder = new FrameDecoder();
    const frames = [...stream].flatMap((byte) => decoder.push(Buffer.from([byte])));
    expect(frames.map((frame) => [frame.connection, frame.kind, frame.bytes.toString()])).toEqual([
      [3, FrameKind.data, "hello"],
      [4, FrameKind.end, ""],
    ]);
    expect(decoder.midFrame).toBe(false);
  });

  it("says when a chunk stops in the middle of a frame", () => {
    const decoder = new FrameDecoder();
    expect(
      decoder.push(encodeFrame(1, FrameKind.data, Buffer.from("abc")).subarray(0, 10)),
    ).toEqual([]);
    expect(decoder.midFrame).toBe(true);
  });

  it("breaks on an unknown kind", () => {
    const frame = encodeFrame(1, FrameKind.data);
    frame.writeUInt8(9, 4);
    expect(() => new FrameDecoder().push(frame)).toThrow(FrameStreamError);
  });

  it("breaks on a length over 64 KiB as soon as the header is in, without waiting for the bytes", () => {
    const header = encodeFrame(1, FrameKind.data);
    header.writeUInt32BE(maxFrameBytes + 1, 5);
    expect(() => new FrameDecoder().push(header)).toThrow(/too long/);
  });
});
