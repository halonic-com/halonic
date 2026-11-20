import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { duration } from "./duration.ts";

verifies("cli.duration", () => {
  it("writes whole seconds under a minute, rounded down", () => {
    expect(duration(18_900)).toBe("18 s");
    expect(duration(59_999)).toBe("59 s");
  });

  it("writes minutes and seconds from a minute on", () => {
    expect(duration(347_000)).toBe("5 min 47 s");
    expect(duration(192_000)).toBe("3 min 12 s");
  });

  it("writes whole minutes when the seconds are 0", () => {
    expect(duration(60_000)).toBe("1 min");
    expect(duration(360_000)).toBe("6 min");
    expect(duration(180_999)).toBe("3 min");
  });

  it("writes 1 s for anything under a second, never 0 s", () => {
    expect(duration(400)).toBe("1 s");
    expect(duration(0)).toBe("1 s");
  });

  it("writes hours and minutes from an hour on, rounded down", () => {
    expect(duration(59 * 60_000 + 59_999)).toBe("59 min 59 s");
    expect(duration(60 * 60_000)).toBe("1 h");
    expect(duration(75 * 60_000)).toBe("1 h 15 min");
    expect(duration(2 * 3_600_000)).toBe("2 h");
    expect(duration(23 * 3_600_000 + 59 * 60_000 + 59_999)).toBe("23 h 59 min");
  });

  it("writes days and hours from 24 hours on, rounded down", () => {
    expect(duration(24 * 3_600_000)).toBe("1 day");
    expect(duration((2158 * 60 + 32) * 1000)).toBe("1 day 11 h");
    expect(duration(47 * 3_600_000 + 59 * 60_000)).toBe("1 day 23 h");
    expect(duration(48 * 3_600_000)).toBe("2 days");
    expect(duration(52 * 3_600_000 + 59 * 60_000)).toBe("2 days 4 h");
    expect(duration(10 * 24 * 3_600_000 + 3_600_000)).toBe("10 days 1 h");
  });
});
