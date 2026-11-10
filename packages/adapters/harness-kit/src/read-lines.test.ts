import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { readLines } from "./read-lines.ts";

const roomy = { maxLineLength: 100 };

/** A stream that gives these chunks, as UTF-8 when they are text. */
function streamOf(...chunks: (string | Uint8Array)[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
      }
      controller.close();
    },
  });
}

async function linesOf(stream: ReadableStream<Uint8Array>, options = roomy): Promise<string[]> {
  const lines: string[] = [];
  for await (const line of readLines(stream, options)) lines.push(line);
  return lines;
}

verifies("harness-kit.read-lines", () => {
  describe("readLines", () => {
    it("reads lines split across chunks, with either line break", async () => {
      const stream = streamOf('{"a":', '1}\n{"b"', ":2}\r\n\n", "last");
      expect(await linesOf(stream)).toEqual(['{"a":1}', '{"b":2}', "", "last"]);
    });

    it("gives no empty line after the final line break", async () => {
      expect(await linesOf(streamOf("one\n", "two\n"))).toEqual(["one", "two"]);
      expect(await linesOf(streamOf())).toEqual([]);
    });

    it("puts a character split across two chunks back together", async () => {
      const bytes = new TextEncoder().encode("café\n");
      const stream = streamOf(bytes.slice(0, 4), bytes.slice(4));
      expect(await linesOf(stream)).toEqual(["café"]);
    });

    it("ends with an error that doesn't quote a line that is too long", async () => {
      const stream = streamOf("short\n", "made-up-secret-".repeat(10));
      const lines: string[] = [];
      const reading = (async () => {
        for await (const line of readLines(stream, { maxLineLength: 20 })) lines.push(line);
      })();
      await expect(reading).rejects.toThrow("longer than 20 characters");
      await expect(reading).rejects.not.toThrow("made-up-secret");
      expect(lines).toEqual(["short"]);
    });

    it("accepts a line of exactly the longest length, not counting \\r", async () => {
      expect(await linesOf(streamOf("12345\r\n"), { maxLineLength: 5 })).toEqual(["12345"]);
    });

    it("cancels the stream when the caller stops early", async () => {
      let cancelled = false;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(new TextEncoder().encode("again\n"));
        },
        cancel() {
          cancelled = true;
        },
      });
      for await (const line of readLines(stream, roomy)) {
        expect(line).toBe("again");
        break;
      }
      expect(cancelled).toBe(true);
    });
  });
});
