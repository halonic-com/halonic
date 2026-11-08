import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { defaultCoordinationCollection } from "./coordination.ts";
import { newWorld, startCoordination } from "./fakes.test-helper.ts";

verifies("adapter-coordination-node.restart", () => {
  describe("surviving a restart", () => {
    it("keeps a lease held until it runs out, and gives the next holder a new token", async () => {
      const world = newWorld();
      const before = startCoordination(world).coordination;
      const old = await before.tryAcquire("routine:daily", 10_000);
      if (old === null) throw new Error("no lease");

      const after = startCoordination(world).coordination;
      world.clock.advance(5_000);
      expect(await after.tryAcquire("routine:daily", 10_000)).toBeNull();
      expect(await after.renew(old, 10_000)).toMatchObject({ token: old.token });
      world.clock.advance(10_000);
      const next = await after.tryAcquire("routine:daily", 10_000);
      expect(next?.token).not.toBe(old.token);
      await after.release(old);
      expect(await after.tryAcquire("routine:daily", 10_000)).toBeNull();
    });

    it("keeps values, counters and windows, and forgets released leases and deleted values", async () => {
      const world = newWorld();
      const before = startCoordination(world).coordination;
      await before.compareAndSet("cursor", null, "a");
      await before.compareAndSet("gone", null, "x");
      await before.compareAndSet("gone", "x", null);
      await before.increment("budget", 4);
      await before.countInWindow("login", 60_000, 2);
      const lease = await before.tryAcquire("lock", 60_000);
      if (lease === null) throw new Error("no lease");
      await before.release(lease);

      const after = startCoordination(world).coordination;
      expect(await after.read("cursor")).toBe("a");
      expect(await after.read("gone")).toBeNull();
      expect(await after.increment("budget", 1, 4)).toEqual({ applied: false, value: 4 });
      expect(await after.countInWindow("login", 60_000, 2)).toMatchObject({ count: 2 });
      expect(await after.tryAcquire("lock", 60_000)).not.toBeNull();
    });

    it("loads again after a counter reached the largest safe whole number", async () => {
      const world = newWorld();
      const before = startCoordination(world).coordination;
      const max = Number.MAX_SAFE_INTEGER;
      await before.increment("total", max);
      await before.increment("total", 1);

      const after = startCoordination(world).coordination;
      expect(await after.read("cursor")).toBeNull();
      expect(await after.increment("total", 1)).toEqual({ applied: false, value: max });
    });

    it("writes a new record as an add and a replacement as an update", async () => {
      const world = newWorld();
      const { coordination } = startCoordination(world);
      await coordination.increment("budget", 1);
      await coordination.increment("budget", 1);
      const changes = await world.store.changes(defaultCoordinationCollection);
      expect(changes.map((change) => change.op)).toEqual(["add", "update"]);
    });

    it("rejects a call and changes nothing when the store fails the write", async () => {
      const { coordination, store } = startCoordination();
      await coordination.increment("budget", 1);
      store.failNextAppend = true;
      await expect(coordination.increment("budget", 1)).rejects.toThrow("unavailable");
      expect(await coordination.increment("budget", 1)).toEqual({ applied: true, value: 2 });
    });

    it("rejects every call, naming the record, when a record isn't one it wrote", async () => {
      const world = newWorld();
      await world.store.append([
        {
          at: new Date(0).toISOString(),
          collection: defaultCoordinationCollection,
          id: '["counter","budget"]',
          op: "add",
          values: { kind: "counter", key: "budget", value: -3 },
        },
      ]);
      const { coordination } = startCoordination(world);
      await expect(coordination.read("cursor")).rejects.toThrow('["counter","budget"]');
      await expect(coordination.increment("budget", 1)).rejects.toThrow("not a lease");
    });
  });
});
