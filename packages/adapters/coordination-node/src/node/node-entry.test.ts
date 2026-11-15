import { ManualClock, MemoryRecordStore } from "@halonicjs/adapter-memory";
import { describe, expect, it } from "vitest";
import { NodeCoordination } from "../index.ts";
import { randomLeaseToken } from "./index.ts";

describe("the ./node entry", () => {
  it("runs the coordination over a store with Node's random tokens", async () => {
    const coordination = new NodeCoordination({
      store: new MemoryRecordStore(),
      clock: new ManualClock("2026-11-09T07:00:00.000Z"),
      newToken: randomLeaseToken,
    });

    const lease = await coordination.tryAcquire("routine:daily", 30_000);
    expect(lease?.token).toMatch(/^lease_[0-9a-f-]{36}$/);
    expect(await coordination.tryAcquire("routine:daily", 30_000)).toBeNull();
  });

  it("gives a different token each time", () => {
    expect(randomLeaseToken()).not.toBe(randomLeaseToken());
  });
});
