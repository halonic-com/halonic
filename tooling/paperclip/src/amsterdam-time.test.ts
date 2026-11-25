import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { amsterdamTime } from "./amsterdam-time.ts";

verifies("paperclip.amsterdam-time", () => {
  describe("amsterdamTime", () => {
    test("a winter time is CET, an hour ahead of UTC", () => {
      expect(amsterdamTime("2026-11-26T15:05:00.000Z")).toBe("26 Nov 16:05 CET");
    });

    test("a summer time is CEST, two hours ahead of UTC", () => {
      expect(amsterdamTime(new Date("2026-07-01T15:40:00Z"))).toBe("1 Jul 17:40 CEST");
    });

    test("the zone follows the daylight saving switch, not a fixed offset", () => {
      // Clocks go back at 01:00 UTC on 25 Oct 2026.
      expect(amsterdamTime("2026-10-25T00:30:00Z")).toBe("25 Oct 02:30 CEST");
      expect(amsterdamTime("2026-10-25T01:30:00Z")).toBe("25 Oct 02:30 CET");
    });

    test("the day is Amsterdam's, not UTC's", () => {
      expect(amsterdamTime(Date.parse("2026-11-25T23:30:00Z"))).toBe("26 Nov 00:30 CET");
    });

    test("text that isn't a time comes back as it is", () => {
      expect(amsterdamTime("")).toBe("");
      expect(amsterdamTime("unknown")).toBe("unknown");
    });
  });
});
