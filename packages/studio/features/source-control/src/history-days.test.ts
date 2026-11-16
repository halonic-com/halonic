import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Version } from "./api.ts";
import { groupByDay } from "./history-days.ts";

const at = (year: number, month: number, day: number, hour = 10) =>
  new Date(year, month - 1, day, hour, 0).getTime();
const version = (id: string, time: number): Version => ({
  id,
  name: id,
  notes: "",
  author: "Sam",
  at: time,
  files: [],
});
const now = new Date(2026, 10, 12, 15, 0);

verifies("source-control.history-page", () => {
  describe("groupByDay", () => {
    it("names today, yesterday, a day this year and a day in an earlier year", () => {
      const days = groupByDay(
        [
          version("a", at(2026, 11, 12, 14)),
          version("b", at(2026, 11, 12, 9)),
          version("c", at(2026, 11, 11)),
          version("d", at(2026, 3, 5)),
          version("e", at(2025, 12, 31)),
        ],
        now,
      );
      expect(days.map((day) => [day.heading, day.versions.map((v) => v.id)])).toEqual([
        ["Today", ["a", "b"]],
        ["Yesterday", ["c"]],
        ["5 March", ["d"]],
        ["31 December 2025", ["e"]],
      ]);
    });

    it("says yesterday across a month's end", () => {
      const days = groupByDay([version("a", at(2026, 10, 31))], new Date(2026, 10, 1, 8, 0));
      expect(days[0]?.heading).toBe("Yesterday");
    });

    it("gives no days for no versions", () => {
      expect(groupByDay([], now)).toEqual([]);
    });
  });
});
