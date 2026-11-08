import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { ManualClock } from "./clock.ts";
import { MemoryCoordination } from "./coordination.ts";

verifies("memory.coordination", () => {
  it("lets a lease run out when its clock moves, and gives the next holder a new token", async () => {
    const clock = new ManualClock();
    const coordination = new MemoryCoordination(clock);
    const first = await coordination.tryAcquire("run:r1", 10_000);
    clock.advance(10_000);
    const second = await coordination.tryAcquire("run:r1", 10_000);
    expect(first?.expiresAt).toBe("2026-01-01T00:00:10.000Z");
    expect(second?.expiresAt).toBe("2026-01-01T00:00:20.000Z");
    expect(second?.token).not.toBe(first?.token);
  });
});
