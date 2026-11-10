import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { maxStreamJsonLineLength, streamJsonLines } from "./output.ts";

/** A program's output, arriving as these chunks of bytes. */
function output(...chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

async function linesOf(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const lines: string[] = [];
  for await (const line of streamJsonLines(stream)) lines.push(line);
  return lines;
}

verifies("harness-claude-code.command", () => {
  describe("streamJsonLines", () => {
    it("splits on \\n and \\r\\n, and keeps a last line without a line break", async () => {
      expect(await linesOf(output(encode("one\r\ntwo\n\nthree")))).toEqual([
        "one",
        "two",
        "",
        "three",
      ]);
    });

    it("keeps a character split across two chunks whole", async () => {
      const bytes = encode("café\n");
      const split = bytes.length - 2;

      expect(await linesOf(output(bytes.slice(0, split), bytes.slice(split)))).toEqual(["café"]);
    });

    it("ends with an error on a line longer than the limit", async () => {
      const stream = output(encode("x".repeat(maxStreamJsonLineLength + 1)));

      await expect(linesOf(stream)).rejects.toThrow(`longer than ${maxStreamJsonLineLength}`);
    });

    it("cancels the output when the reader stops early", async () => {
      let cancelled = false;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(encode("again\n"));
        },
        cancel() {
          cancelled = true;
        },
      });
      for await (const _line of streamJsonLines(stream)) break;

      expect(cancelled).toBe(true);
    });
  });
});
