import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { CronError } from "./cron-error.ts";
import { parseEvery } from "./parse-every.ts";

verifies("routines.parse-every", () => {
  // Ported from "parses intervals and computes the next run" at 784f78d (the
  // parseEvery lines; nextRun stays with the trigger code).
  it("parses intervals", () => {
    expect(parseEvery("15m")).toBe(900_000);
    expect(parseEvery("2h")).toBe(7_200_000);
  });

  it("reads days", () => {
    expect(parseEvery("1d")).toBe(86_400_000);
  });

  it("ignores spaces around the interval", () => {
    expect(parseEvery(" 30m ")).toBe(1_800_000);
    expect(parseEvery("\t1h\n")).toBe(3_600_000);
  });
});

verifies("routines.parse-every-rejects-bad-intervals", () => {
  // Ported from "parses intervals and computes the next run" at 784f78d.
  it("rejects a zero interval", () => {
    expect(() => parseEvery("0m")).toThrow(CronError);
    expect(() => parseEvery("0m")).toThrow(
      '"0m" is not an interval. Use for example "15m", "1h" or "1d".',
    );
  });

  it("rejects a leading zero", () => {
    expect(() => parseEvery("05m")).toThrow(CronError);
  });

  it("rejects other units and other ways of writing one", () => {
    for (const text of ["15s", "1w", "15M", "15 m", "1.5h", "+1h", "-1h"]) {
      expect(() => parseEvery(text), text).toThrow(CronError);
    }
  });

  it("rejects a count or a unit on its own", () => {
    expect(() => parseEvery("m")).toThrow(CronError);
    expect(() => parseEvery("15")).toThrow(CronError);
  });

  it("rejects empty text and quotes it as given", () => {
    expect(() => parseEvery("")).toThrow('"" is not an interval');
    expect(() => parseEvery("  ")).toThrow('"  " is not an interval');
  });
});
