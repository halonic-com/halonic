import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { CronError } from "./cron-error.ts";
import { checkTimeZone, MINUTE, utcOffset, wallTime } from "./time-zone.ts";

verifies("routines.check-time-zone", () => {
  // Ported from the time-zone lines of "rejects bad expressions with readable errors" at
  // 784f78d, which checked them through triggerError (that stays in schedule.ts).
  it("rejects an unknown zone with a readable error and accepts a known one", () => {
    expect(() => checkTimeZone("Mars/Olympus")).toThrow(CronError);
    expect(() => checkTimeZone("Mars/Olympus")).toThrow('Unknown time zone "Mars/Olympus"');
    expect(() => checkTimeZone("Europe/Amsterdam")).not.toThrow();
    expect(() => checkTimeZone("UTC")).not.toThrow();
  });
});

verifies("routines.wall-time", () => {
  // Ported from "evaluates in the routine's time zone" at 784f78d.
  it("reads the wall clock in a zone", () => {
    expect(wallTime(new Date("2026-11-03T07:00:00Z"), "Europe/Amsterdam")).toMatchObject({
      hour: 8,
      minute: 0,
      weekday: 2,
    });
  });

  it("gives every field, with the date of the zone and not of UTC", () => {
    // 23:30 UTC on Saturday 31 October is already Sunday 1 November in Tokyo.
    expect(wallTime(new Date("2026-10-31T23:30:59Z"), "Asia/Tokyo")).toEqual({
      year: 2026,
      month: 11,
      day: 1,
      hour: 8,
      minute: 30,
      weekday: 0,
    });
  });

  it("reads midnight as hour 0", () => {
    expect(wallTime(new Date("2026-11-03T00:00:00Z"), "UTC")).toMatchObject({ hour: 0, minute: 0 });
  });

  it("uses this machine's zone when none is given", () => {
    const now = new Date("2026-11-03T12:34:00Z");
    expect(wallTime(now)).toEqual(wallTime(now, Intl.DateTimeFormat().resolvedOptions().timeZone));
  });

  it("measures the offset from UTC in whole minutes", () => {
    const instant = Date.parse("2026-07-01T06:00:45Z");
    expect(utcOffset(instant, wallTime(new Date(instant), "Europe/Amsterdam"))).toBe(120 * MINUTE);
    expect(utcOffset(instant, wallTime(new Date(instant), "Asia/Kathmandu"))).toBe(345 * MINUTE);
    expect(utcOffset(instant, wallTime(new Date(instant), "America/New_York"))).toBe(-240 * MINUTE);
  });
});
