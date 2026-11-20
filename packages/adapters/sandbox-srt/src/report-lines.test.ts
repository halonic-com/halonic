import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { ReportLines } from "./report-lines.ts";

const bytes = (text: string) => new TextEncoder().encode(text);

function collect(maxLineBytes: number) {
  const lines: string[] = [];
  const reader = new ReportLines(maxLineBytes, (line) => lines.push(line));
  return { lines, reader };
}

verifies("sandbox-srt.network-reports", () => {
  describe("ReportLines", () => {
    it("passes on each line, without its line feed or carriage return", () => {
      const { lines, reader } = collect(64);
      reader.push(bytes("first\nsecond\r\nthird"));
      reader.end();
      expect(lines).toEqual(["first", "second", "third"]);
    });

    it("puts a line split across chunks back together, also inside a UTF-8 character", () => {
      const { lines, reader } = collect(64);
      const whole = bytes("café.example\n");
      reader.push(whole.subarray(0, 4));
      reader.push(whole.subarray(4, 6));
      reader.push(whole.subarray(6));
      expect(lines).toEqual(["café.example"]);
    });

    it("drops a line longer than the limit whole, and reads the next one", () => {
      const { lines, reader } = collect(16);
      reader.push(bytes(`${"x".repeat(40)}\nkept\n`));
      expect(lines).toEqual(["kept"]);
    });

    it("holds no more than the limit of an over-long line that never ends", () => {
      const { lines, reader } = collect(1024);
      for (let chunk = 0; chunk < 1000; chunk++) {
        reader.push(bytes("y".repeat(1000)));
        expect(reader.heldBytes).toBeLessThanOrEqual(1024);
      }
      reader.push(bytes("\nafter\n"));
      reader.end();
      expect(lines).toEqual(["after"]);
    });

    it("passes on nothing for an over-long last line without a line feed", () => {
      const { lines, reader } = collect(16);
      reader.push(bytes("z".repeat(40)));
      reader.end();
      expect(lines).toEqual([]);
    });
  });
});
