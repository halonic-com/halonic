// `DurableCoordination` against the real coordination objects inside workerd: which object it
// asks, and that it holds no stub (see `durable-coordination.test.ts`).

import { describe, expect, it } from "vitest";
import { DurableCoordination, defaultCoordinationObjectName } from "../durable-coordination.ts";
import { countingNamespace } from "./coordination-case.ts";

export { TestCoordinationObject } from "./test-coordination-object.ts";

describe("DurableCoordination", () => {
  it("gets a fresh object stub for every call", async () => {
    const namespace = countingNamespace();
    const coordination = new DurableCoordination({
      namespace,
      objectName: crypto.randomUUID(),
    });
    expect(namespace.gets).toBe(0);
    await coordination.read("a");
    await coordination.read("a");
    expect(namespace.gets).toBe(2);
  });

  it("uses the default object name unless one is given", async () => {
    const namespace = countingNamespace();
    new DurableCoordination({ namespace });
    new DurableCoordination({ namespace, objectName: "acme" });
    expect(namespace.names).toEqual([defaultCoordinationObjectName, "acme"]);
  });
});
