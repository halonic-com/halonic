import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { outputTail } from "./output-tail.ts";

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

verifies("harness-kit.read-lines", () => {
  describe("outputTail", () => {
    it("keeps only the last characters of a long output", async () => {
      expect(await outputTail(output(encode("a".repeat(100)), encode("end")), 5)).toBe("aaend");
    });

    it("puts a character split across two chunks back together", async () => {
      const bytes = encode("café");
      expect(await outputTail(output(bytes.slice(0, 4), bytes.slice(4)), 10)).toBe("café");
    });
  });
});
