import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { startCoordination } from "./fakes.test-helper.ts";

const iso = (ms: number) => new Date(ms).toISOString();

verifies("coordination-node.coordination", () => {
  describe("leases", () => {
    it("gives a lease to one holder at a time, until its expiry time", async () => {
      const { coordination, clock } = startCoordination();
      const lease = await coordination.tryAcquire("run:r1", 10_000);
      expect(lease).toEqual({
        key: "run:r1",
        token: "lease_1",
        expiresAt: iso(clock.now().getTime() + 10_000),
      });
      clock.advance(9_999);
      expect(await coordination.tryAcquire("run:r1", 10_000)).toBeNull();
      clock.advance(1);
      expect(await coordination.tryAcquire("run:r1", 10_000)).toMatchObject({ token: "lease_2" });
    });

    it("renews and releases only for the token that holds the lease", async () => {
      const { coordination, clock } = startCoordination();
      const old = await coordination.tryAcquire("run:r1", 10_000);
      if (old === null) throw new Error("no lease");
      clock.advance(9_000);
      const renewed = await coordination.renew(old, 10_000);
      expect(renewed).toEqual({ ...old, expiresAt: iso(clock.now().getTime() + 10_000) });
      clock.advance(10_000);
      expect(await coordination.renew(old, 10_000)).toBeNull();
      const current = await coordination.tryAcquire("run:r1", 10_000);
      await coordination.release(old);
      expect(await coordination.tryAcquire("run:r1", 10_000)).toBeNull();
      if (current === null) throw new Error("no lease");
      await coordination.release(current);
      await coordination.release(current);
      expect(await coordination.tryAcquire("run:r1", 10_000)).not.toBeNull();
    });
  });

  describe("values and counters", () => {
    it("sets a value only while it is what the caller expects, and deletes it with null", async () => {
      const { coordination } = startCoordination();
      expect(await coordination.compareAndSet("cursor", null, "a")).toBe(true);
      expect(await coordination.compareAndSet("cursor", null, "b")).toBe(false);
      expect(await coordination.compareAndSet("cursor", "a", "b")).toBe(true);
      expect(await coordination.read("cursor")).toBe("b");
      expect(await coordination.compareAndSet("cursor", "b", null)).toBe(true);
      expect(await coordination.read("cursor")).toBeNull();
      expect(await coordination.compareAndSet("cursor", null, null)).toBe(true);
    });

    it("adds to a counter, and never lets parallel increments pass the limit", async () => {
      const { coordination } = startCoordination();
      const results = await Promise.all(
        Array.from({ length: 10 }, () => coordination.increment("budget", 1, 5)),
      );
      expect(results.filter((result) => result.applied)).toHaveLength(5);
      expect(await coordination.increment("budget", 1, 5)).toEqual({ applied: false, value: 5 });
      expect(await coordination.increment("budget", 2)).toEqual({ applied: true, value: 7 });
    });

    it("without a limit, stops a counter at the largest safe whole number", async () => {
      const { coordination } = startCoordination();
      const max = Number.MAX_SAFE_INTEGER;
      expect(await coordination.increment("total", max)).toEqual({ applied: true, value: max });
      expect(await coordination.increment("total", 1)).toEqual({ applied: false, value: max });
    });
  });

  describe("windows", () => {
    it("counts in a window that starts with the first attempt and ends before start + windowMs", async () => {
      const { coordination, clock } = startCoordination();
      const start = clock.now().getTime();
      const resetAt = iso(start + 1000);
      expect(await coordination.countInWindow("login", 1000, 1)).toEqual({
        allowed: true,
        count: 1,
        resetAt,
      });
      clock.advance(999);
      expect(await coordination.countInWindow("login", 1000, 1)).toEqual({
        allowed: false,
        count: 1,
        resetAt,
      });
      clock.advance(1);
      expect(await coordination.countInWindow("login", 1000, 1)).toEqual({
        allowed: true,
        count: 1,
        resetAt: iso(start + 2000),
      });
    });

    it("never lets parallel attempts past the limit", async () => {
      const { coordination } = startCoordination();
      const results = await Promise.all(
        Array.from({ length: 10 }, () => coordination.countInWindow("login", 60_000, 3)),
      );
      expect(results.filter((result) => result.allowed)).toHaveLength(3);
    });
  });

  describe("input rules", () => {
    it("refuses a bad key, value or amount with a RangeError and changes nothing", async () => {
      const { coordination, store } = startCoordination();
      const before = await store.changes("halonic.coordination");
      for (const key of ["", "é".repeat(129)]) {
        await expect(coordination.tryAcquire(key, 1000)).rejects.toThrow(RangeError);
        await expect(coordination.read(key)).rejects.toThrow(RangeError);
        await expect(coordination.release({ key, token: "t", expiresAt: iso(0) })).rejects.toThrow(
          RangeError,
        );
      }
      for (const amount of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
        await expect(coordination.increment("budget", amount)).rejects.toThrow(RangeError);
        await expect(coordination.increment("budget", 1, amount)).rejects.toThrow(RangeError);
        await expect(coordination.countInWindow("w", amount, 1)).rejects.toThrow(RangeError);
      }
      const tooBig = `${"é".repeat(32_768)}a`;
      await expect(coordination.compareAndSet("big", null, tooBig)).rejects.toThrow(RangeError);
      expect(await store.changes("halonic.coordination")).toEqual(before);
      expect(await coordination.tryAcquire("é".repeat(128), 1000)).not.toBeNull();
    });
  });
});
