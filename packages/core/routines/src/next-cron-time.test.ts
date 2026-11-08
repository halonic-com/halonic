import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { nextCronTime } from "./next-cron-time.ts";
import { parseCron } from "./parse-cron.ts";

const d = (iso: string) => new Date(iso);
const iso = (x: Date | null) => x?.toISOString() ?? null;

verifies("routines.next-cron-time", () => {
  // Ported from "finds the next time in UTC" at 784f78d.
  it("finds the next time in UTC", () => {
    expect(iso(nextCronTime("0 8 * * 1-5", d("2026-11-06T09:00:00Z"), "UTC"))).toBe(
      "2026-11-09T08:00:00.000Z",
    ); // Fri -> Mon
    expect(iso(nextCronTime("*/15 * * * *", d("2026-11-03T10:07:30Z"), "UTC"))).toBe(
      "2026-11-03T10:15:00.000Z",
    );
    expect(iso(nextCronTime("0 0 29 2 *", d("2026-03-01T00:00:00Z"), "UTC"))).toBe(
      "2028-02-29T00:00:00.000Z",
    );
    // Strictly after: a time exactly on the schedule moves to the next one.
    expect(iso(nextCronTime("0 * * * *", d("2026-11-03T10:00:00Z"), "UTC"))).toBe(
      "2026-11-03T11:00:00.000Z",
    );
  });

  // Ported from "uses OR when both day-of-month and day-of-week are set" at 784f78d.
  it("uses OR when both day-of-month and day-of-week are set", () => {
    // 1st of the month or a Monday; 2026-11-01 is a Sunday.
    expect(iso(nextCronTime("0 9 1 * mon", d("2026-11-01T10:00:00Z"), "UTC"))).toBe(
      "2026-11-02T09:00:00.000Z",
    );
  });

  // Ported from "evaluates in the routine's time zone" at 784f78d.
  it("evaluates in the routine's time zone", () => {
    // 08:00 in Amsterdam is 07:00 UTC in winter (CET) and 06:00 UTC in summer (CEST).
    expect(iso(nextCronTime("0 8 * * *", d("2026-11-03T00:00:00Z"), "Europe/Amsterdam"))).toBe(
      "2026-11-03T07:00:00.000Z",
    );
    expect(iso(nextCronTime("0 8 * * *", d("2026-07-01T00:00:00Z"), "Europe/Amsterdam"))).toBe(
      "2026-07-01T06:00:00.000Z",
    );
  });

  it("needs the month and the restricted day field to match together", () => {
    // The first Monday in February after 2026-11-03 is 2027-02-01.
    expect(iso(nextCronTime("0 8 * feb mon", d("2026-11-03T00:00:00Z"), "UTC"))).toBe(
      "2027-02-01T08:00:00.000Z",
    );
  });

  it("takes an already parsed cron", () => {
    expect(iso(nextCronTime(parseCron("@hourly"), d("2026-11-03T10:30:00Z"), "UTC"))).toBe(
      "2026-11-03T11:00:00.000Z",
    );
  });

  it("gives null when nothing matches within five years", () => {
    expect(nextCronTime("0 0 30 2 *", d("2026-01-01T00:00:00Z"), "UTC")).toBeNull();
  });

  it("throws on a bad expression or an unknown zone", () => {
    expect(() => nextCronTime("60 * * * *", d("2026-01-01T00:00:00Z"), "UTC")).toThrow(/0-59/);
    expect(() => nextCronTime("0 * * * *", d("2026-01-01T00:00:00Z"), "Mars/Olympus")).toThrow(
      RangeError,
    );
  });
});

verifies("routines.next-cron-time-dst", () => {
  const newYork = "America/New_York";

  describe("when the clocks go forward", () => {
    it("does not skip the day after the change (regression: the old code fired a week late)", () => {
      // New York springs forward on Sunday 2026-03-08. Monday 00:30 EDT is 04:30 UTC.
      expect(iso(nextCronTime("30 0 * * 1", d("2026-03-07T17:00:00Z"), newYork))).toBe(
        "2026-03-09T04:30:00.000Z",
      );
    });

    it("makes up a set time inside the gap once, at the first minute after it", () => {
      // 02:30 doesn't exist in New York on 2026-03-08; the job runs at 03:00 EDT
      // instead (the old code waited until the 9th), then at 02:30 EDT on the 9th.
      expect(iso(nextCronTime("30 2 * * *", d("2026-03-08T05:00:00Z"), newYork))).toBe(
        "2026-03-08T07:00:00.000Z",
      );
      expect(iso(nextCronTime("30 2 * * *", d("2026-03-08T07:00:00Z"), newYork))).toBe(
        "2026-03-09T06:30:00.000Z",
      );
    });

    it("makes up several set times inside the gap only once", () => {
      expect(iso(nextCronTime("0,30 2 * * *", d("2026-03-08T07:00:00Z"), newYork))).toBe(
        "2026-03-09T06:00:00.000Z",
      );
    });

    it("does not make up the skipped minutes of a wildcard hour", () => {
      // Hourly at :15: 01:15 EST, then 03:15 EDT; 02:15 never happens.
      expect(iso(nextCronTime("15 * * * *", d("2026-03-08T06:50:00Z"), newYork))).toBe(
        "2026-03-08T07:15:00.000Z",
      );
      expect(iso(nextCronTime("*/15 * * * *", d("2026-03-08T06:50:00Z"), newYork))).toBe(
        "2026-03-08T07:00:00.000Z",
      );
    });

    it("handles a 30-minute change (Lord Howe Island)", () => {
      // 02:00-02:29 doesn't exist on 2026-10-04, so 02:15 runs at 02:30 +11:00.
      expect(
        iso(nextCronTime("15 2 * * *", d("2026-10-03T12:00:00Z"), "Australia/Lord_Howe")),
      ).toBe("2026-10-03T15:30:00.000Z");
    });

    it("stops at the first minute after the jump when the jump is as long as the skip", () => {
      // From 01:58:30 EST the next minute is already 03:00 EDT, the first minute of hour 3.
      expect(iso(nextCronTime("0 3 * * *", d("2026-03-08T06:58:30Z"), newYork))).toBe(
        "2026-03-08T07:00:00.000Z",
      );
    });

    it("handles a day that starts at 01:00 (Santiago)", () => {
      // Chile skips from Saturday 23:59 to Sunday 01:00 on 2026-09-06, so
      // midnight that Sunday is made up at 01:00.
      expect(iso(nextCronTime("0 1 * * 0", d("2026-09-05T16:00:00Z"), "America/Santiago"))).toBe(
        "2026-09-06T04:00:00.000Z",
      );
      expect(iso(nextCronTime("0 0 * * *", d("2026-09-05T16:00:00Z"), "America/Santiago"))).toBe(
        "2026-09-06T04:00:00.000Z",
      );
    });
  });

  describe("when the clocks go back", () => {
    it("fires a set time in the repeated hour once (the old code fired twice)", () => {
      const firstPass = "2026-11-01T05:30:00.000Z"; // 01:30 EDT
      expect(iso(nextCronTime("30 1 * * *", d("2026-11-01T04:00:00Z"), newYork))).toBe(firstPass);
      expect(iso(nextCronTime("30 1 * * *", d(firstPass), newYork))).toBe(
        "2026-11-02T06:30:00.000Z",
      );
      // Asked during the second copy, before its 01:30 EST: still the next day.
      expect(iso(nextCronTime("30 1 * * *", d("2026-11-01T06:10:00Z"), newYork))).toBe(
        "2026-11-02T06:30:00.000Z",
      );
    });

    it("runs a set hour with every minute only through the first copy", () => {
      // After 01:59 EDT, all of 01:00-01:59 EST has been shown already.
      expect(iso(nextCronTime("* 1 * * *", d("2026-11-01T05:59:00Z"), newYork))).toBe(
        "2026-11-02T06:00:00.000Z",
      );
    });

    it("keeps a wildcard hour running through both copies", () => {
      // 01:50 EDT, then 01:00 EST ten real minutes later.
      expect(iso(nextCronTime("*/15 * * * *", d("2026-11-01T05:50:00Z"), newYork))).toBe(
        "2026-11-01T06:00:00.000Z",
      );
      expect(iso(nextCronTime("0 * * * *", d("2026-11-01T05:00:00Z"), newYork))).toBe(
        "2026-11-01T06:00:00.000Z",
      );
      expect(iso(nextCronTime("* * * * *", d("2026-11-01T05:59:00Z"), newYork))).toBe(
        "2026-11-01T06:00:00.000Z",
      );
    });

    it("lands early and looks again when the day ends late (Santiago)", () => {
      // Chile goes from Saturday 23:59 -03 back to 23:00 -04 on 2026-04-04, so
      // Saturday has 25 hours; Sunday 00:00 -04 is 04:00 UTC.
      expect(iso(nextCronTime("0 0 * * 0", d("2026-04-04T12:00:00Z"), "America/Santiago"))).toBe(
        "2026-04-05T04:00:00.000Z",
      );
      // 23:30 on that Saturday is shown twice and fires once, at 23:30 -03.
      expect(iso(nextCronTime("30 23 * * 6", d("2026-04-04T12:00:00Z"), "America/Santiago"))).toBe(
        "2026-04-05T02:30:00.000Z",
      );
      expect(iso(nextCronTime("30 23 * * 6", d("2026-04-05T02:30:00Z"), "America/Santiago"))).toBe(
        "2026-04-12T03:30:00.000Z",
      );
    });
  });
});
