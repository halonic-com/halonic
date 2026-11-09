import { verifies } from "@halonicjs/testing-spec";
import { assert, describe, expect, it } from "vitest";
import {
  invalidAmounts,
  invalidCoordinationKeys,
  longestCoordinationKey,
  type MakeCoordination,
} from "./coordination-harness.ts";

const iso = (ms: number) => new Date(ms).toISOString();

/**
 * The contract every {@link Coordination} adapter passes. The adapter reads
 * its time from the harness's clock, so leases and windows run out when the
 * suite moves it.
 */
export function coordinationContract(name: string, make: MakeCoordination): void {
  verifies("contracts.coordination", () => {
    describe(`Coordination contract: ${name}`, () => {
      leaseCases(make);
      leaseExpiryCases(make);
      valueCases(make);
      counterCases(make);
      windowCases(make);
      inputCases(make);
    });
  });
}

function leaseCases(make: MakeCoordination): void {
  it("gives a lease to one holder at a time, the caller included", async () => {
    const { coordination, clock } = await make();
    const lease = await coordination.tryAcquire("routine:daily", 30_000);
    expect(lease).toMatchObject({
      key: "routine:daily",
      expiresAt: iso(clock.now().getTime() + 30_000),
    });
    expect(await coordination.tryAcquire("routine:daily", 30_000)).toBeNull();
    expect(await coordination.tryAcquire("routine:weekly", 30_000)).not.toBeNull();
  });

  it("renews a lease still held, keeping its token", async () => {
    const { coordination, clock } = await make();
    const lease = await coordination.tryAcquire("run:r1", 10_000);
    assert(lease !== null, "no lease");
    clock.advance(9_000);
    const renewed = await coordination.renew(lease, 10_000);
    expect(renewed).toEqual({ ...lease, expiresAt: iso(clock.now().getTime() + 10_000) });
    clock.advance(9_000);
    expect(await coordination.tryAcquire("run:r1", 10_000)).toBeNull();
  });

  it("frees a released lease, and releasing twice does nothing", async () => {
    const { coordination } = await make();
    const lease = await coordination.tryAcquire("run:r1", 10_000);
    assert(lease !== null, "no lease");
    await coordination.release(lease);
    await coordination.release(lease);
    expect(await coordination.tryAcquire("run:r1", 10_000)).not.toBeNull();
  });
}

function leaseExpiryCases(make: MakeCoordination): void {
  it("ends a lease at its expiry time, so a crashed holder never keeps it", async () => {
    const { coordination, clock } = await make();
    expect(await coordination.tryAcquire("run:r1", 10_000)).not.toBeNull();
    clock.advance(9_999);
    expect(await coordination.tryAcquire("run:r1", 10_000)).toBeNull();
    clock.advance(1);
    expect(await coordination.tryAcquire("run:r1", 10_000)).not.toBeNull();
  });

  it("does nothing for an old holder once the lease ran out or was taken over", async () => {
    const { coordination, clock } = await make();
    const old = await coordination.tryAcquire("run:r1", 10_000);
    assert(old !== null, "no lease");
    clock.advance(10_000);
    expect(await coordination.renew(old, 10_000)).toBeNull();
    const current = await coordination.tryAcquire("run:r1", 10_000);
    expect(current?.token).not.toBe(old.token);
    expect(await coordination.renew(old, 10_000)).toBeNull();
    await coordination.release(old);
    expect(await coordination.tryAcquire("run:r1", 10_000)).toBeNull();
  });
}

function valueCases(make: MakeCoordination): void {
  it("sets a value only while it is still what the caller expects, and deletes it with null", async () => {
    const { coordination } = await make();
    expect(await coordination.read("cursor")).toBeNull();
    expect(await coordination.compareAndSet("cursor", null, "a")).toBe(true);
    expect(await coordination.compareAndSet("cursor", null, "b")).toBe(false);
    expect(await coordination.compareAndSet("cursor", "x", "b")).toBe(false);
    expect(await coordination.compareAndSet("cursor", "a", "b")).toBe(true);
    expect(await coordination.read("cursor")).toBe("b");
    expect(await coordination.compareAndSet("cursor", "b", null)).toBe(true);
    expect(await coordination.read("cursor")).toBeNull();
  });

  it("takes a value of 64 KiB of UTF-8 and refuses a longer one", async () => {
    const { coordination } = await make();
    const largest = "é".repeat(32_768);
    expect(await coordination.compareAndSet("big", null, largest)).toBe(true);
    await expect(coordination.compareAndSet("big", largest, `${largest}a`)).rejects.toThrow(
      RangeError,
    );
    expect(await coordination.read("big")).toBe(largest);
  });
}

function counterCases(make: MakeCoordination): void {
  it("adds to a counter from 0, and leaves it when the limit would be passed", async () => {
    const { coordination } = await make();
    expect(await coordination.increment("budget", 5)).toEqual({ applied: true, value: 5 });
    expect(await coordination.increment("budget", 3, 7)).toEqual({ applied: false, value: 5 });
    expect(await coordination.increment("budget", 2, 7)).toEqual({ applied: true, value: 7 });
    expect(await coordination.increment("other", 1)).toEqual({ applied: true, value: 1 });
  });

  it("never lets parallel increments pass the limit", async () => {
    const { coordination } = await make();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => coordination.increment("budget", 1, 5)),
    );
    expect(results.filter((result) => result.applied)).toHaveLength(5);
    expect(await coordination.increment("budget", 1, 5)).toEqual({ applied: false, value: 5 });
  });
}

function windowCases(make: MakeCoordination): void {
  it("counts attempts in a window that starts with the first one", async () => {
    const { coordination, clock } = await make();
    const start = clock.now().getTime();
    const resetAt = iso(start + 1000);
    expect(await coordination.countInWindow("login", 1000, 2)).toEqual({
      allowed: true,
      count: 1,
      resetAt,
    });
    clock.advance(500);
    expect(await coordination.countInWindow("login", 1000, 2)).toEqual({
      allowed: true,
      count: 2,
      resetAt,
    });
    clock.advance(499);
    const refused = { allowed: false, count: 2, resetAt };
    expect(await coordination.countInWindow("login", 1000, 2)).toEqual(refused);
    clock.advance(1);
    expect(await coordination.countInWindow("login", 1000, 2)).toEqual({
      allowed: true,
      count: 1,
      resetAt: iso(start + 2000),
    });
  });

  it("never lets parallel attempts past the limit", async () => {
    const { coordination } = await make();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => coordination.countInWindow("login", 60_000, 3)),
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(3);
  });
}

function inputCases(make: MakeCoordination): void {
  it("keeps leases, values, counters and windows with the same key apart", async () => {
    const { coordination } = await make();
    expect(await coordination.tryAcquire("same", 10_000)).not.toBeNull();
    expect(await coordination.read("same")).toBeNull();
    expect(await coordination.increment("same", 1)).toEqual({ applied: true, value: 1 });
    expect((await coordination.countInWindow("same", 1000, 5)).count).toBe(1);
    expect(await coordination.compareAndSet("same", null, "v")).toBe(true);
    expect(await coordination.increment("same", 1)).toEqual({ applied: true, value: 2 });
  });

  it("refuses a bad key or amount with a RangeError and changes nothing", async () => {
    const { coordination } = await make();
    await coordination.increment("budget", 1);
    const held = await coordination.tryAcquire("held", 1000);
    assert(held !== null, "no lease");
    for (const key of invalidCoordinationKeys) {
      await expect(coordination.tryAcquire(key, 1000)).rejects.toThrow(RangeError);
      await expect(coordination.read(key)).rejects.toThrow(RangeError);
      await expect(coordination.compareAndSet(key, null, "v")).rejects.toThrow(RangeError);
      await expect(coordination.increment(key, 1)).rejects.toThrow(RangeError);
      await expect(coordination.countInWindow(key, 1000, 1)).rejects.toThrow(RangeError);
    }
    for (const amount of invalidAmounts) {
      const label = String(amount);
      await expect(coordination.tryAcquire("lock", amount), label).rejects.toThrow(RangeError);
      await expect(coordination.renew(held, amount), label).rejects.toThrow(RangeError);
      await expect(coordination.increment("budget", amount), label).rejects.toThrow(RangeError);
      await expect(coordination.increment("budget", 1, amount), label).rejects.toThrow(RangeError);
      await expect(coordination.countInWindow("w", amount, 1), label).rejects.toThrow(RangeError);
      await expect(coordination.countInWindow("w", 1000, amount), label).rejects.toThrow(
        RangeError,
      );
    }
    expect(await coordination.increment("budget", 1)).toEqual({ applied: true, value: 2 });
    expect(await coordination.tryAcquire("lock", 1000)).not.toBeNull();
    expect((await coordination.countInWindow("w", 1000, 1)).count).toBe(1);
    expect(await coordination.tryAcquire(longestCoordinationKey, 1000)).not.toBeNull();
  });
}
