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
export { RunObject } from "../run-object.ts";

/** What the runner binds for this suite (see `class-names.test.ts`). */
interface TestEnv {
  DEPLOYED: DurableObjectNamespace<adapter.CoordinationObject>;
  RUN_DEPLOYED: DurableObjectNamespace<adapter.RunObject>;
}

describe("Durable Object class names", () => {
  it("are the ones already deployed", () => {
    expect(adapter.durableObjectClassNames).toEqual(["CoordinationObject", "RunObject"]);
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

  it("run the run object under its own name, keeping a timer", async () => {
    const { RUN_DEPLOYED } = env as TestEnv;
    const scheduler = new adapter.DurableScheduler({ namespace: RUN_DEPLOYED });
    const at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await scheduler.schedule("run_1", "wait", at);
    expect(await scheduler.pending("run_1")).toEqual([{ key: "run_1", timerId: "wait", at }]);
    await scheduler.cancel("run_1", "wait");
  });
});
