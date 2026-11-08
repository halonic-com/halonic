import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { CronError } from "./cron-error.ts";
import { describeCron } from "./describe-cron.ts";

verifies("routines.describe-cron", () => {
  // Ported from the schedule cases of "describes triggers for people" at
  // 784f78d. The old first case also had a time zone; adding it is the
  // trigger's job, ported with `describeTrigger` under HAL-115.
  it("describes the common shapes for people", () => {
    expect(describeCron("0 8 * * 1-5")).toBe("Weekdays at 08:00");
    expect(describeCron("30 7 * * *")).toBe("Daily at 07:30");
    expect(describeCron("0 9 * * mon")).toBe("Mondays at 09:00");
    expect(describeCron("0 6 * * 0,6")).toBe("Weekends at 06:00");
    expect(describeCron("0 9 1 * *")).toBe("Monthly on day 1 at 09:00");
    expect(describeCron("*/10 * * * *")).toBe("Every 10 minutes");
    expect(describeCron("5 * * * *")).toBe("Hourly at :05");
    expect(describeCron("0 8 1-7 * 1")).toBe('Cron "0 8 1-7 * 1"');
  });

  it("lists several named weekdays in week order", () => {
    expect(describeCron("0 9 * * fri,mon,wed")).toBe("Mondays, Wednesdays, Fridays at 09:00");
  });

  it("reads 7 as Sunday", () => {
    expect(describeCron("0 9 * * 7")).toBe("Sundays at 09:00");
    expect(describeCron("0 6 * * 6,7")).toBe("Weekends at 06:00");
  });

  it("says every minute for a step of one", () => {
    expect(describeCron("*/1 * * * *")).toBe("Every minute");
  });

  it("describes macros by what they expand to", () => {
    expect(describeCron("@hourly")).toBe("Hourly at :00");
    expect(describeCron("@daily")).toBe("Daily at 00:00");
    expect(describeCron("@weekly")).toBe("Sundays at 00:00");
    expect(describeCron("@monthly")).toBe("Monthly on day 1 at 00:00");
  });

  it("falls back to the expression when there is no short phrase", () => {
    // Not every month.
    expect(describeCron("0 9 * jan *")).toBe('Cron "0 9 * jan *"');
    expect(describeCron("@yearly")).toBe('Cron "@yearly"');
    // More than one minute or hour.
    expect(describeCron("0,30 9 * * *")).toBe('Cron "0,30 9 * * *"');
    expect(describeCron("0 9-17 * * *")).toBe('Cron "0 9-17 * * *"');
    // A step over minutes with another field restricted.
    expect(describeCron("*/10 9 * * *")).toBe('Cron "*/10 9 * * *"');
    // Several days of the month.
    expect(describeCron("0 9 1,15 * *")).toBe('Cron "0 9 1,15 * *"');
  });

  it("throws a CronError for a malformed expression", () => {
    expect(() => describeCron("0 8 * *")).toThrow(CronError);
  });
});
