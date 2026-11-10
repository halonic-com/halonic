import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  FrameLineError,
  FrameLineWriter,
  FrameTooLargeError,
  readFrameLines,
} from "./frame-lines.ts";
import { maxFrameBytes } from "./frames.ts";

const encoder = new TextEncoder();

/** A stream that yields these pieces, then ends; `open` leaves it open after them. */
function streamOf(pieces: Uint8Array[], open = false): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start: (controller) => {
      for (const piece of pieces) controller.enqueue(piece);
      if (!open) controller.close();
    },
  });
}

async function readAll(stream: ReadableStream<Uint8Array>, maxBytes?: number): Promise<unknown[]> {
  const values: unknown[] = [];
  for await (const value of readFrameLines(stream, maxBytes)) values.push(value);
  return values;
}

async function problemOf(stream: ReadableStream<Uint8Array>, maxBytes?: number) {
  try {
    await readAll(stream, maxBytes);
  } catch (error) {
    if (error instanceof FrameLineError) return error.problem;
    throw error;
  }
  return "none";
}

verifies("integration-runner.frames", () => {
  describe("readFrameLines", () => {
    it("reads frames split across pieces in any way, whole and in order", async () => {
      const text = '{"type":"ping","n":1}\n{"type":"ping","n":2}\n{"a":"é"}\n';
      const bytes = encoder.encode(text);
      for (const cut of [1, 5, 22, 23, 30, bytes.length - 2]) {
        const pieces = [bytes.subarray(0, cut), bytes.subarray(cut)];
        expect(await readAll(streamOf(pieces))).toEqual([
          { type: "ping", n: 1 },
          { type: "ping", n: 2 },
          { a: "é" },
        ]);
      }
    });

    it("takes a frame of exactly the limit, newline included", async () => {
      const line = `"${"x".repeat(maxFrameBytes - 3)}"\n`;
      expect(encoder.encode(line).byteLength).toBe(maxFrameBytes);
      const [value] = await readAll(streamOf([encoder.encode(line)]));
      expect(value).toHaveLength(maxFrameBytes - 3);
    });

    it("refuses a line over the limit before its end arrives", async () => {
      // The stream stays open, so the reader can only fail by refusing early.
      const tooLong = encoder.encode(`"${"x".repeat(maxFrameBytes)}`);
      expect(await problemOf(streamOf([tooLong], true))).toBe("too-large");
    });

    it("refuses a line one byte over the limit with its newline", async () => {
      const line = `"${"x".repeat(maxFrameBytes - 2)}"\n`;
      expect(await problemOf(streamOf([encoder.encode(line)]))).toBe("too-large");
    });

    it("refuses bytes that aren't UTF-8", async () => {
      const bytes = new Uint8Array([0x22, 0xff, 0xfe, 0x22, 0x0a]);
      expect(await problemOf(streamOf([bytes]))).toBe("not-utf8");
    });

    it("refuses a line that isn't JSON, and an empty line", async () => {
      expect(await problemOf(streamOf([encoder.encode("{type:ping}\n")]))).toBe("not-json");
      expect(await problemOf(streamOf([encoder.encode("\n")]))).toBe("not-json");
    });

    it("refuses a last line cut off by the end of the stream", async () => {
      expect(await problemOf(streamOf([encoder.encode('{"type":"po')]))).toBe("cut-off");
    });
  });

  describe("FrameLineWriter", () => {
    it("writes one JSON line per frame, in order", async () => {
      const lines = new TransformStream<Uint8Array, Uint8Array>();
      const writer = new FrameLineWriter(lines.writable);
      const read = readAll(lines.readable);
      await writer.write({ type: "ping", n: 0 });
      await writer.write({ type: "ping", n: 1 });
      await writer.close();
      expect(await read).toEqual([
        { type: "ping", n: 0 },
        { type: "ping", n: 1 },
      ]);
    });

    it("refuses a frame over the limit and writes nothing", async () => {
      const lines = new TransformStream<Uint8Array, Uint8Array>();
      const writer = new FrameLineWriter(lines.writable);
      const read = readAll(lines.readable);
      expect(() => writer.write({ text: "x".repeat(maxFrameBytes) })).toThrow(FrameTooLargeError);
      await writer.close();
      expect(await read).toEqual([]);
    });

    it("counts the bytes the other side hasn't taken yet", async () => {
      const lines = new TransformStream<Uint8Array, Uint8Array>();
      const writer = new FrameLineWriter(lines.writable);
      const line = `${JSON.stringify({ type: "ping", n: 0 })}\n`.length;
      const written = [writer.write({ type: "ping", n: 0 }), writer.write({ type: "ping", n: 1 })];
      expect(writer.queuedBytes).toBe(2 * line);
      const read = readAll(lines.readable);
      await Promise.all(written);
      expect(writer.queuedBytes).toBe(0);
      await writer.close();
      await read;
    });
  });
});
