import type { Coordination } from "@halonicjs/ports";
import { coordinationContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { CoordinationState } from "./coordination-state.ts";
import { DurableCoordination, defaultCoordinationObjectName } from "./durable-coordination.ts";
import { FakeStateStorage, ManualClock } from "./fakes.test-helper.ts";

/** A namespace of objects made on first use, each its own state, as Durable Objects are. */
function fakeNamespace(clock: ManualClock) {
  const objects = new Map<string, Coordination>();
  return {
    names: [] as string[],
    idFromName(name: string): string {
      this.names.push(name);
      return name;
    },
    get(id: string): Coordination {
      const existing = objects.get(id);
      if (existing !== undefined) return existing;
      const created = new CoordinationState(new FakeStateStorage(), clock);
      objects.set(id, created);
      return created;
    },
  };
}

coordinationContract("durable coordination over fake objects, in Node", async () => {
  const clock = new ManualClock();
  return { coordination: new DurableCoordination({ namespace: fakeNamespace(clock) }), clock };
});

describe("DurableCoordination", () => {
  it("gets a fresh object stub for every call", async () => {
    const clock = new ManualClock();
    const inner = fakeNamespace(clock);
    let gets = 0;
    const namespace = {
      idFromName: (name: string) => inner.idFromName(name),
      get(id: string): Coordination {
        gets += 1;
        return inner.get(id);
      },
    };
    const coordination = new DurableCoordination({ namespace });
    expect(gets).toBe(0);
    await coordination.read("a");
    await coordination.read("a");
    expect(gets).toBe(2);
  });

  it("uses the default object name unless one is given", async () => {
    const namespace = fakeNamespace(new ManualClock());
    new DurableCoordination({ namespace });
    new DurableCoordination({ namespace, objectName: "acme" });
    expect(namespace.names).toEqual([defaultCoordinationObjectName, "acme"]);
  });
});

verifies("cloudflare-durable.coordination", () => {
  describe("object names", () => {
    it("share state between adapters of one name and keep other names apart", async () => {
      const namespace = fakeNamespace(new ManualClock());
      const first = new DurableCoordination({ namespace, objectName: "acme" });
      const sameName = new DurableCoordination({ namespace, objectName: "acme" });
      const otherName = new DurableCoordination({ namespace, objectName: "globex" });
      expect(await first.tryAcquire("run:r1", 10_000)).not.toBeNull();
      expect(await sameName.tryAcquire("run:r1", 10_000)).toBeNull();
      expect(await otherName.tryAcquire("run:r1", 10_000)).not.toBeNull();
    });
  });
});
