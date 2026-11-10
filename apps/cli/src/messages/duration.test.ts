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

  it("has no unit larger than minutes", () => {
    expect(duration(75 * 60_000)).toBe("75 min");
  });
});
