import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { CronError } from "./cron-error.ts";
import { parseCron } from "./parse-cron.ts";

const sorted = (values: Set<number>) => [...values].sort((a, b) => a - b);

verifies("routines.parse-cron", () => {
  // Ported from "parses fields, ranges, steps, names and macros" at 784f78d.
  it("parses fields, ranges, steps, names and macros", () => {
    const cron = parseCron("*/15 8-18/2 * jan,dec mon-fri");
    expect([...cron.minutes]).toEqual([0, 15, 30, 45]);
    expect([...cron.hours]).toEqual([8, 10, 12, 14, 16, 18]);
    expect([...cron.months]).toEqual([1, 12]);
    expect([...cron.weekdays]).toEqual([1, 2, 3, 4, 5]);
    expect([...parseCron("0 0 * * 7").weekdays].sort()).toEqual([0, 7]);
    expect([...parseCron("@daily").hours]).toEqual([0]);
  });

  it("expands every field of a macro", () => {
    const daily = parseCron("@daily");
    expect([...daily.minutes]).toEqual([0]);
    expect(daily.days.size).toBe(31);
    expect(daily.months.size).toBe(12);
  });

  it("reads macros in any case and ignores surrounding spaces", () => {
    expect(parseCron("  @WEEKLY ")).toEqual(parseCron("0 0 * * 0"));
    expect(parseCron("@midnight")).toEqual(parseCron("@daily"));
    expect(parseCron("@annually")).toEqual(parseCron("@yearly"));
    expect(parseCron("@monthly")).toEqual(parseCron("0 0 1 * *"));
    expect(parseCron("@hourly")).toEqual(parseCron("0 * * * *"));
  });

  it("runs a single value with a step to the end of the field", () => {
    expect(sorted(parseCron("5/20 * * * *").minutes)).toEqual([5, 25, 45]);
  });

  it("reads names in any case", () => {
    const cron = parseCron("0 9 1 JAN SUN");
    expect(sorted(cron.months)).toEqual([1]);
    expect(sorted(cron.weekdays)).toEqual([0]);
  });

  it("reads every month name as its number, January being 1", () => {
    const names = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ];
    names.forEach((name, index) => {
      expect(sorted(parseCron(`0 0 1 ${name} *`).months)).toEqual([index + 1]);
    });
  });

  it("reads every weekday name as its number, Sunday being 0", () => {
    const names = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    names.forEach((name, index) => {
      expect(sorted(parseCron(`0 0 * * ${name}`).weekdays)).toEqual([index]);
    });
  });

  it("splits fields on any run of whitespace", () => {
    expect(parseCron("0\t9  * *   1")).toEqual(parseCron("0 9 * * 1"));
  });

  it("records which day fields restrict the day", () => {
    expect(parseCron("0 9 1 * mon")).toMatchObject({
      dayOr: true,
      daysAny: false,
      weekdaysAny: false,
    });
    expect(parseCron("0 9 * * mon")).toMatchObject({
      dayOr: false,
      daysAny: true,
      weekdaysAny: false,
    });
    expect(parseCron("0 9 1 * *")).toMatchObject({
      dayOr: false,
      daysAny: false,
      weekdaysAny: true,
    });
    // A step over the whole field is not a bare "*", so it still counts as a restriction.
    expect(parseCron("0 9 */1 * *").daysAny).toBe(false);
  });

  it("records whether the hour field runs through every hour", () => {
    expect(parseCron("*/15 * * * *").hoursWildcard).toBe(true);
    expect(parseCron("0 */2 * * *").hoursWildcard).toBe(true);
    expect(parseCron("30 1 * * *").hoursWildcard).toBe(false);
    // Like classic cron, a step from a set hour still names set hours.
    expect(parseCron("0 8-18/2 * * *").hoursWildcard).toBe(false);
    expect(parseCron("@hourly").hoursWildcard).toBe(true);
  });
});

verifies("routines.cron-rejects-bad-expressions", () => {
  // Ported from the parseCron lines of "rejects bad expressions with readable errors" at 784f78d.
  it("rejects bad expressions with readable errors", () => {
    expect(() => parseCron("* * * *")).toThrow(/5 fields/);
    expect(() => parseCron("60 * * * *")).toThrow('Minute: "60" is outside 0-59.');
    expect(() => parseCron("*/0 * * * *")).toThrow(/step/);
    expect(() => parseCron("x * * * *")).toThrow('Minute: "x" is not a number.');
  });

  it("throws a CronError that counts the fields", () => {
    expect(() => parseCron("* * * *")).toThrow(CronError);
    expect(() => parseCron("* * * *")).toThrow(
      "Cron needs 5 fields (minute hour day month weekday), got 4.",
    );
    expect(() => parseCron("")).toThrow(/5 fields/);
  });

  it("names the error class", () => {
    expect(new CronError("x").name).toBe("CronError");
  });

  it("rejects a range that runs backwards", () => {
    expect(() => parseCron("0 0 * * 5-1")).toThrow('Weekday: "5-1" is outside 0-7.');
  });

  it("rejects an empty or doubled step part", () => {
    expect(() => parseCron("/5 * * * *")).toThrow('Minute: "/5" is not a valid part.');
    expect(() => parseCron("1/2/3 * * * *")).toThrow('Minute: "1/2/3" is not a valid part.');
  });

  it("rejects a range with an empty end, naming the part", () => {
    expect(() => parseCron("1-/5 * * * *")).toThrow('Minute: "1-" in "1-/5" is not a valid range.');
    expect(() => parseCron("-5 * * * *")).toThrow('Minute: "-5" is not a valid range.');
  });

  it("names an unknown macro instead of counting its fields", () => {
    expect(() => parseCron("@reboot")).toThrow(CronError);
    expect(() => parseCron("@reboot")).toThrow(
      'Unknown macro "@reboot". Use one of @hourly, @daily, @midnight, @weekly, @monthly, @yearly, @annually.',
    );
  });

  it("treats names inherited by every object as plain text, not macros", () => {
    // These once matched Object.prototype members and failed with a TypeError.
    expect(() => parseCron("constructor")).toThrow(CronError);
    expect(() => parseCron("constructor")).toThrow(/5 fields/);
    expect(() => parseCron("__proto__")).toThrow(CronError);
    expect(() => parseCron("__proto__")).toThrow(/5 fields/);
  });

  it("rejects a range with more than two ends", () => {
    expect(() => parseCron("1-2-3 * * * *")).toThrow('Minute: "1-2-3" is not a valid range.');
  });

  it("rejects a step that is not a plain whole number", () => {
    expect(() => parseCron("*/1e1 * * * *")).toThrow(
      'Minute: "*/1e1" needs a step that is a whole number of 1 or more.',
    );
    expect(() => parseCron("*/ * * * *")).toThrow(/step/);
  });

  it("names the field a bad value sits in", () => {
    expect(() => parseCron("0 24 * * *")).toThrow('Hour: "24" is outside 0-23.');
    expect(() => parseCron("0 0 32 * *")).toThrow('Day: "32" is outside 1-31.');
    expect(() => parseCron("0 0 0 * *")).toThrow('Day: "0" is outside 1-31.');
    expect(() => parseCron("0 0 * 13 *")).toThrow('Month: "13" is outside 1-12.');
    expect(() => parseCron("0 0 * * 8")).toThrow('Weekday: "8" is outside 0-7.');
  });

  it("reports the first bad field from the left", () => {
    expect(() => parseCron("60 24 * * *")).toThrow(/0-59/);
  });
});
