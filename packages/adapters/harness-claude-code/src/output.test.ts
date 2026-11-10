import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { outputLines, outputTail } from "./output.ts";

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
  for await (const line of outputLines(stream)) lines.push(line);
  return lines;
}

verifies("harness-claude-code.command", () => {
  describe("outputLines", () => {
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

    it("leaves the output open when the reader stops early, for the program's end to close", async () => {
      const stream = output(encode("one\n"), encode("two\n"));
      for await (const _line of outputLines(stream)) break;

      expect(stream.locked).toBe(false);
      expect(await linesOf(stream)).toEqual(["two"]);
    });
  });

  describe("outputTail", () => {
    it("keeps only the last characters of a long output", async () => {
      expect(await outputTail(output(encode("a".repeat(100)), encode("end")), 5)).toBe("aaend");
    });
  });
});
