import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { dueWords, tookWords } from "./time-words.ts";

verifies("runs.row", () => {
  describe("tookWords", () => {
    it("writes seconds, then minutes and seconds, never under 1 s", () => {
      expect(tookWords(18_900)).toBe("18 s");
      expect(tookWords(347_000)).toBe("5 min 47 s");
      expect(tookWords(360_000)).toBe("6 min");
      expect(tookWords(400)).toBe("1 s");
    });

    it("writes hours and minutes from an hour on, and days and hours from 48 hours", () => {
      expect(tookWords(59 * 60_000 + 59_999)).toBe("59 min 59 s");
      expect(tookWords(60 * 60_000)).toBe("1 h");
      expect(tookWords((36 * 60 + 2) * 60_000 + 32_000)).toBe("36 h 2 min");
      expect(tookWords(36 * 3_600_000)).toBe("36 h");
      expect(tookWords(47 * 3_600_000 + 59 * 60_000 + 59_999)).toBe("47 h 59 min");
      expect(tookWords(48 * 3_600_000)).toBe("2 days");
      expect(tookWords(52 * 3_600_000 + 59 * 60_000)).toBe("2 days 4 h");
    });
  });

  describe("dueWords", () => {
    const now = new Date(2026, 10, 9, 10, 40);

    it("writes today's time, tomorrow, or the day and month", () => {
      expect(dueWords(new Date(2026, 10, 9, 14, 0), now)).toBe("14:00");
      expect(dueWords(new Date(2026, 10, 10, 8, 0), now)).toBe("tomorrow 08:00");
      expect(dueWords(new Date(2026, 11, 3, 8, 0), now)).toBe("3 Dec 08:00");
    });
  });
});
