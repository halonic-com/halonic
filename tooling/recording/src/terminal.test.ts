import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import type { Cast } from "./asciicast.ts";
import { playCast } from "./terminal.ts";

function castOf(outputs: readonly (readonly [number, string])[], width = 20, height = 3): Cast {
  return {
    header: { version: 2, width, height, duration: 10 },
    events: outputs.map(([time, data]) => ({ time, kind: "o", data })),
  };
}

verifies("recording.svg", () => {
  describe("playCast", () => {
    test("groups a line into styled spans, with spaces joining the span they sit in", () => {
      const tape = playCast(castOf([[0, "\x1b[32m✓\x1b[39m Read it   \x1b[2m1 s\x1b[22m"]]));
      expect(tape.lines[0]).toEqual([
        {
          time: 0,
          spans: [
            { column: 0, text: "✓", style: { colour: 2, bold: false, dim: false } },
            { column: 2, text: "Read it", style: { colour: "default", bold: false, dim: false } },
            { column: 12, text: "1 s", style: { colour: "default", bold: false, dim: true } },
          ],
        },
      ]);
    });

    test("keeps each version of a line with the time it appeared", () => {
      const tape = playCast(
        castOf([
          [0, "~ $ "],
          [0.5, "e"],
          [0.6, "c"],
        ]),
      );
      expect(tape.lines[0]?.map((version) => [version.time, version.spans[0]?.text])).toEqual([
        [0, "~ $"],
        [0.5, "~ $ e"],
        [0.6, "~ $ ec"],
      ]);
      expect(tape.cursor.at(-1)).toEqual({ time: 0.6, line: 0, column: 6 });
    });

    test("scrolls when the output passes the last row", () => {
      const tape = playCast(
        castOf([
          [0, "a\r\nb\r\nc"],
          [1, "\r\nd"],
        ]),
      );
      expect(tape.scroll).toEqual([
        { time: 0, top: 0 },
        { time: 1, top: 1 },
      ]);
    });

    test("reads an escape code that is split over two events", () => {
      const tape = playCast(
        castOf([
          [0, "\x1b[3"],
          [0.1, "3m!"],
        ]),
      );
      expect(tape.lines[0]?.at(-1)?.spans[0]?.style.colour).toBe(3);
    });

    test("erases to the end of the line and writes on from the cursor", () => {
      const tape = playCast(
        castOf(
          [
            [0, "abcdef\x1b[3D\x1b[K"],
            [1, "xyz"],
          ],
          6,
          3,
        ),
      );
      expect(tape.lines[0]?.at(-1)?.spans[0]?.text).toBe("abcxyz");
    });

    test("stops at a line wider than the window, naming the line", () => {
      expect(() => playCast(castOf([[0, "ok\r\nabcdefg"]], 6, 3))).toThrow(
        'Line 2 is wider than the 6 columns: "abcdefg…".',
      );
    });

    test("stops at an escape code it doesn't draw, naming it", () => {
      expect(() => playCast(castOf([[0, "\x1b[?25l"]]))).toThrow(/Unsupported escape code/);
      expect(() => playCast(castOf([[0, "\x1b[2J"]]))).toThrow(/ESC\[2J/);
      expect(() => playCast(castOf([[0, "\x1b[4mx"]]))).toThrow(/SGR 4/);
    });

    test("stops at a character two columns wide", () => {
      expect(() => playCast(castOf([[0, "🙂"]]))).toThrow(/two columns/);
    });
  });
});
