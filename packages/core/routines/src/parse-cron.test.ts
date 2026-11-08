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
});

verifies("routines.cron-rejects-bad-expressions", () => {
  // Ported from the parseCron lines of "rejects bad expressions with readable errors" at 784f78d.
  it("rejects bad expressions with readable errors", () => {
    expect(() => parseCron("* * * *")).toThrow(/5 fields/);
    expect(() => parseCron("60 * * * *")).toThrow(/outside 0-59/);
    expect(() => parseCron("*/0 * * * *")).toThrow(/step/);
    expect(() => parseCron("x * * * *")).toThrow(/not a number/);
  });

  it("throws a CronError that counts the fields", () => {
    expect(() => parseCron("* * * *")).toThrow(CronError);
    expect(() => parseCron("* * * *")).toThrow(
      "Cron needs 5 fields (minute hour day month weekday), got 4",
    );
    expect(() => parseCron("")).toThrow(/5 fields/);
  });

  it("names the error class", () => {
    expect(new CronError("x").name).toBe("CronError");
  });

  it("rejects a range that runs backwards", () => {
    expect(() => parseCron("0 0 * * 5-1")).toThrow('"5-1" is outside 0-7');
  });

  it("rejects an empty or doubled step part", () => {
    expect(() => parseCron("/5 * * * *")).toThrow('Bad part "/5"');
    expect(() => parseCron("1/2/3 * * * *")).toThrow('Bad part "1/2/3"');
  });

  it("rejects a range with an empty end, naming the part", () => {
    expect(() => parseCron("1-/5 * * * *")).toThrow('Bad range "1-" in "1-/5"');
    expect(() => parseCron("-5 * * * *")).toThrow('Bad range "-5"');
  });

  it("names an unknown macro instead of counting its fields", () => {
    expect(() => parseCron("@reboot")).toThrow(CronError);
    expect(() => parseCron("@reboot")).toThrow(
      'Unknown macro "@reboot"; use one of @hourly, @daily, @midnight, @weekly, @monthly, @yearly, @annually',
    );
  });

  it("rejects a range with more than two ends", () => {
    expect(() => parseCron("1-2-3 * * * *")).toThrow('Bad range "1-2-3"');
  });

  it("rejects a step that is not a plain whole number", () => {
    expect(() => parseCron("*/1e1 * * * *")).toThrow('Bad step in "*/1e1"');
    expect(() => parseCron("*/ * * * *")).toThrow(/step/);
  });

  it("reports the first bad field from the left", () => {
    expect(() => parseCron("60 24 * * *")).toThrow(/0-59/);
  });
});
