import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { describeTrigger } from "./describe-trigger.ts";

verifies("routines.describe-trigger", () => {
  // Ported from "describes triggers for people" at 784f78d; the cron lines
  // are in describe-cron.test.ts.
  it("adds the time zone to a schedule", () => {
    const trigger = { schedule: "0 8 * * 1-5", timezone: "Europe/Amsterdam" };
    expect(describeTrigger(trigger)).toBe("Weekdays at 08:00 (Europe/Amsterdam)");
  });

  it("describes a schedule without a zone as its cron", () => {
    expect(describeTrigger({ schedule: "30 7 * * *" })).toBe("Daily at 07:30");
  });

  it("describes intervals in the largest unit that divides them", () => {
    expect(describeTrigger({ every: "15m" })).toBe("Every 15 minutes");
    expect(describeTrigger({ every: "1d" })).toBe("Every day (UTC)");
    expect(describeTrigger({ every: "120m" })).toBe("Every 2 hours (UTC)");
    expect(describeTrigger({ every: "48h" })).toBe("Every 2 days (UTC)");
  });

  it("describes a manual trigger", () => {
    expect(describeTrigger({ manual: true })).toBe("Manual only");
  });

  // New: the old code had these branches but its test never reached them.
  it("describes a signal trigger, and says when it is filtered", () => {
    expect(describeTrigger({ signal: { name: "ready" } })).toBe("On signal ready");
    const filtered = { signal: { name: "ready", when: { path: "x", equals: 1 } } };
    expect(describeTrigger(filtered as never)).toBe("On signal ready (filtered)");
  });

  it("describes a mail trigger, naming the query only when it isn't the inbox", () => {
    const mail = (query: string) => ({ mail: { connector: "gmail", query, every: "2m" } });
    expect(describeTrigger(mail("in:inbox"))).toBe("New mail in gmail");
    expect(describeTrigger(mail("from:boss"))).toBe('New mail in gmail matching "from:boss"');
  });

  it("says so when the schedule or interval doesn't parse", () => {
    expect(describeTrigger({ schedule: "nope" })).toBe('Invalid schedule "nope"');
    expect(describeTrigger({ every: "soon" })).toBe("Every soon");
  });
});
