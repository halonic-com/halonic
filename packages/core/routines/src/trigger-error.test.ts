import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { triggerError } from "./trigger-error.ts";

verifies("routines.trigger-error", () => {
  // Ported from "rejects bad expressions with readable errors" at 784f78d
  // (the two triggerError lines; the parseCron lines are in parse-cron.test.ts).
  it("names an unknown time zone", () => {
    expect(triggerError({ schedule: "0 8 * * 1-5", timezone: "Mars/Olympus" })).toMatch(
      /time zone/,
    );
  });

  it("accepts a known time zone", () => {
    expect(triggerError({ schedule: "0 8 * * 1-5", timezone: "Europe/Amsterdam" })).toBeNull();
  });

  it("gives the parser's message for a cron that doesn't parse", () => {
    expect(triggerError({ schedule: "* * * *" })).toMatch(/5 fields/);
  });

  it("checks the interval of an every trigger", () => {
    expect(triggerError({ every: "15m" })).toBeNull();
    expect(triggerError({ every: "0m" })).toMatch(/not an interval/);
  });

  it("checks the interval of a mail trigger, and accepts 15m", () => {
    const mail = (every: string) => ({ mail: { connector: "gmail", query: "in:inbox", every } });
    expect(triggerError(mail("15m"))).toBeNull();
    expect(triggerError(mail("1ddm"))).toMatch(/not an interval/);
  });

  it("has nothing to check on manual and signal triggers", () => {
    expect(triggerError({ manual: true })).toBeNull();
    expect(triggerError({ signal: { name: "ready" } })).toBeNull();
  });
});
