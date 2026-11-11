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
