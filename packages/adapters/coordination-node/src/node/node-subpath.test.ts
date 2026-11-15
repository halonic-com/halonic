import { ManualClock, MemoryRecordStore } from "@halonicjs/adapter-memory";
import { describe, expect, it } from "vitest";
import { NodeCoordination } from "../index.ts";
import { randomLeaseToken } from "./index.ts";

describe("the ./node subpath", () => {
  it("holds a lease on a plain record store with a real random token", async () => {
    const coordination = new NodeCoordination({
      store: new MemoryRecordStore(),
      clock: new ManualClock("2026-11-09T07:00:00.000Z"),
      newToken: randomLeaseToken,
    });
    const lease = await coordination.tryAcquire("routine:daily", 30_000);
    expect(lease).not.toBeNull();
    expect(await coordination.tryAcquire("routine:daily", 30_000)).toBeNull();
    expect(randomLeaseToken()).toMatch(/^lease_[0-9a-f-]{36}$/);
  });
});
