/**
 * Checks that the Durable Object class names stay put (HAL-6795): Cloudflare
 * deletes an object's data with its class, so a renamed or removed class is
 * data loss. The Worker re-exports the class under its own name, as the
 * real Worker will, and this runs it with the real clock.
 */

import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import * as adapter from "../index.ts";

export { CoordinationObject } from "../coordination-object.ts";

/** What the runner binds for this suite (see `class-names.test.ts`). */
interface TestEnv {
  DEPLOYED: DurableObjectNamespace<adapter.CoordinationObject>;
}

describe("Durable Object class names", () => {
  it("are the ones already deployed", () => {
    expect(adapter.durableObjectClassNames).toEqual(["CoordinationObject"]);
  });

  it("are all still exported as classes under their names", () => {
    const exported: Record<string, unknown> = { ...adapter };
    for (const name of adapter.durableObjectClassNames) {
      const exportedClass = exported[name];
      expect(typeof exportedClass, name).toBe("function");
    }
  });

  it("run under their own name with the real clock", async () => {
    const { DEPLOYED } = env as TestEnv;
    const coordination = new adapter.DurableCoordination({ namespace: DEPLOYED });
    const lease = await coordination.tryAcquire("run:r1", 60_000);
    expect(lease).toMatchObject({ key: "run:r1" });
    expect(await coordination.tryAcquire("run:r1", 60_000)).toBeNull();
  });
});
