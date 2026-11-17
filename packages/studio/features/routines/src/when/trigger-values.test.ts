import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  cronFor,
  defaultTrigger,
  intervalText,
  readInterval,
  readTime,
  simpleSchedule,
  timeText,
} from "./trigger-values.ts";

verifies("routines.when.trigger-fields", () => {
  it("writes the shortest cron line for the chosen days and time", () => {
    const at = (days: number[], hour: number, minute: number) =>
      cronFor({ days: new Set(days), hour, minute });
    expect(at([1, 2, 3, 4, 5], 7, 30)).toBe("30 7 * * 1-5");
    expect(at([0, 1, 2, 3, 4, 5, 6], 18, 0)).toBe("0 18 * * *");
    expect(at([6, 0], 10, 15)).toBe("15 10 * * 0,6");
    expect(at([1, 2], 9, 5)).toBe("5 9 * * 1,2");
    expect(at([1, 2, 3, 5], 9, 5)).toBe("5 9 * * 1-3,5");
  });

  it("reads the schedules the chips can show and refuses the rest", () => {
    expect(simpleSchedule("30 7 * * 1-5")).toEqual({
      days: new Set([1, 2, 3, 4, 5]),
      hour: 7,
      minute: 30,
    });
    expect(simpleSchedule("0 18 * * *")?.days.size).toBe(7);
    expect(simpleSchedule("0 9 * * 7")?.days).toEqual(new Set([0]));
    expect(simpleSchedule("@daily")).toMatchObject({ hour: 0, minute: 0 });
    expect(simpleSchedule("@weekly")?.days).toEqual(new Set([0]));
    for (const detailed of [
      "*/15 * * * *",
      "0 9 1 * *",
      "0 9,17 * * *",
      "0 9 * 1 *",
      "0 9 * * 1-",
      "0 9 * * 8",
      "@hourly",
      "0 9 * *",
    ]) {
      expect(simpleSchedule(detailed), detailed).toBeUndefined();
    }
  });

  it("reads and writes the time field", () => {
    expect(timeText(7, 5)).toBe("07:05");
    expect(readTime("18:00")).toEqual({ hour: 18, minute: 0 });
    expect(readTime("")).toBeUndefined();
    expect(readTime("24:00")).toBeUndefined();
  });

  it("splits an interval into a count and a unit, and refuses what the engine refuses", () => {
    expect(readInterval("15m")).toEqual({ count: 15, unit: "m" });
    expect(readInterval("1d")).toEqual({ count: 1, unit: "d" });
    for (const text of ["1.5h", "0m", "07m", "h", "100000m", "5s"]) {
      expect(readInterval(text), text).toBeUndefined();
    }
    expect(intervalText({ count: 2, unit: "h" })).toBe("2h");
  });

  it("writes each kind's default trigger", () => {
    expect(defaultTrigger("manual", "Europe/Amsterdam")).toEqual({ kind: "manual" });
    expect(defaultTrigger("schedule", "Europe/Amsterdam")).toEqual({
      kind: "schedule",
      cron: "0 8 * * 1-5",
      timeZone: "Europe/Amsterdam",
    });
    expect(defaultTrigger("schedule", undefined)).toEqual({
      kind: "schedule",
      cron: "0 8 * * 1-5",
    });
    expect(defaultTrigger("every", undefined)).toEqual({ kind: "every", interval: "1h" });
  });
});
