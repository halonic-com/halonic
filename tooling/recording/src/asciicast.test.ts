import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { type Cast, formatCast, parseCast } from "./asciicast.ts";

verifies("recording.capture", () => {
  describe("asciicast v2", () => {
    test("writes a header line and one line per event, and reads them back", () => {
      const cast: Cast = {
        header: { version: 2, width: 80, height: 24, duration: 19.8 },
        events: [
          { time: 0, kind: "o", data: "\u001b[2m~\u001b[22m $ " },
          { time: 0.4000004, kind: "m", data: "halonic test" },
        ],
      };
      const text = formatCast(cast);
      expect(text.split("\n")[2]).toBe('[0.4,"m","halonic test"]');
      expect(parseCast(text)).toEqual({
        header: cast.header,
        events: [cast.events[0], { time: 0.4, kind: "m", data: "halonic test" }],
      });
    });

    test("refuses what isn't asciicast v2", () => {
      expect(() => parseCast("")).toThrow(/empty/);
      expect(() => parseCast('{"version":1,"width":1,"height":1}')).toThrow(/v2 header/);
      expect(() => parseCast('{"version":2,"width":1,"height":1}\n[0,"o"]')).toThrow(/Line 2/);
      expect(() => parseCast('{"version":2,"width":1,"height":1}\n[0,"x","a"]')).toThrow(/Line 2/);
    });
  });
});
