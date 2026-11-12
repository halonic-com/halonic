/**
 * The `Coordination` contract against `DurableCoordination`, inside workerd.
 * The Durable Object here is `CoordinationObject` with a clock the suite
 * moves: the suite and the object run in one workerd isolate, so a map in
 * this module reaches both. Every `make()` uses a new object name, so each
 * case starts empty.
 */

import { env } from "cloudflare:workers";
import { type ControlledClock, coordinationContract } from "@halonicjs/testing-contracts";
import { CoordinationObject } from "../coordination-object.ts";
import { DurableCoordination } from "../durable-coordination.ts";
import { ManualClock } from "../fakes.test-helper.ts";

/** What the runner binds for this suite (see `coordination.test.ts`). */
interface TestEnv {
  COORDINATION: DurableObjectNamespace<TestCoordinationObject>;
}

/** A clock that only moves when the suite moves it. */
const clocksByObjectName = new Map<string, ControlledClock>();

/** `CoordinationObject` reading the time from the suite's clock for its own name. */
export class TestCoordinationObject extends CoordinationObject {
  protected override clock = {
    now: (): Date => {
      const name = this.ctx.id.name;
      const clock = name === undefined ? undefined : clocksByObjectName.get(name);
      if (clock === undefined) {
        throw new Error("This test object was not made through the suite's make().");
      }
      return clock.now();
    },
  };
}

coordinationContract("durable object", async () => {
  const objectName = crypto.randomUUID();
  const clock = new ManualClock();
  clocksByObjectName.set(objectName, clock);
  const { COORDINATION } = env as TestEnv;
  return { coordination: new DurableCoordination({ namespace: COORDINATION, objectName }), clock };
});
