import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { MemoryUsageStorage } from "./test/memory-usage-storage.ts";
import { takeRateSlot, type UsageRateLimits } from "./usage-rate.ts";

const limits: UsageRateLimits = { windowMs: 60_000, perScope: 3, perActor: 2 };
const minuteStart = 1_800_000_000_000 - (1_800_000_000_000 % 60_000);

verifies("cloudflare-durable.usage-rate", () => {
  it("refuses a scope's call past its limit until the next window", () => {
    const storage = new MemoryUsageStorage();
    const person = { actor: "u_acme", scope: "u/acme" };
    for (let call = 0; call < 3; call++) {
      expect(takeRateSlot(storage, person, minuteStart + call, limits)).toBeNull();
    }
    expect(takeRateSlot(storage, person, minuteStart + 59_999, limits)).toEqual({
      code: "usage.rate",
      limit: 3,
      resetsAt: minuteStart + 60_000,
    });
    expect(takeRateSlot(storage, person, minuteStart + 60_000, limits)).toBeNull();
  });

  it("refuses one member of an organisation and still lets another call", () => {
    const storage = new MemoryUsageStorage();
    const ada = { actor: "u_ada", scope: "o/acme" };
    const bo = { actor: "u_bo", scope: "o/acme" };
    expect(takeRateSlot(storage, ada, minuteStart, limits)).toBeNull();
    expect(takeRateSlot(storage, ada, minuteStart, limits)).toBeNull();
    expect(takeRateSlot(storage, ada, minuteStart, limits)).toEqual({
      code: "usage.member.rate",
      limit: 2,
      resetsAt: minuteStart + 60_000,
    });
    // Ada's refused call wasn't counted, so the scope has one call left for Bo.
    expect(takeRateSlot(storage, bo, minuteStart, limits)).toBeNull();
    expect(takeRateSlot(storage, bo, minuteStart, limits)?.code).toBe("usage.rate");
  });

  it("counts a person's own scope only by its scope limit", () => {
    const storage = new MemoryUsageStorage();
    const person = { actor: "u_acme", scope: "u/acme" };
    takeRateSlot(storage, person, minuteStart, limits);
    takeRateSlot(storage, person, minuteStart, limits);
    expect(takeRateSlot(storage, person, minuteStart, limits)).toBeNull();
  });
});
