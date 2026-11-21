// Object names inside workerd: which `DurableCoordination` adapters share the real coordination
// objects' state (see `durable-coordination.test.ts`).

import { describe, expect, it } from "vitest";
import { DurableCoordination } from "../durable-coordination.ts";
import { countingNamespace } from "./coordination-case.ts";

export { TestCoordinationObject } from "./test-coordination-object.ts";

describe("object names", () => {
  it("share state between adapters of one name and keep other names apart", async () => {
    const namespace = countingNamespace();
    const first = new DurableCoordination({ namespace, objectName: "acme" });
    const sameName = new DurableCoordination({ namespace, objectName: "acme" });
    const otherName = new DurableCoordination({ namespace, objectName: "globex" });
    expect(await first.tryAcquire("run:r1", 10_000)).not.toBeNull();
    expect(await sameName.tryAcquire("run:r1", 10_000)).toBeNull();
    expect(await otherName.tryAcquire("run:r1", 10_000)).not.toBeNull();
  });
});
