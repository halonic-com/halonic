/**
 * The `Coordination` contract against `DurableCoordination`, inside workerd.
 * The Durable Object here is `CoordinationObject` with a clock the suite
 * moves: the suite and the object run in one workerd isolate, so a map in
 * this module reaches both. Every `make()` uses a new object name, so each
 * case starts empty.
 */

import { env } from "cloudflare:workers";
import { coordinationContract } from "@halonicjs/testing-contracts";
import { DurableCoordination } from "../durable-coordination.ts";
import { ManualClock } from "../fakes.test-helper.ts";
import { clocksByObjectName, TestCoordinationObject } from "./test-coordination-object.ts";

export { TestCoordinationObject };

/** What the runner binds for this suite (see `coordination.test.ts`). */
interface TestEnv {
  COORDINATION: DurableObjectNamespace<TestCoordinationObject>;
}

coordinationContract("durable object", async () => {
  const objectName = crypto.randomUUID();
  const clock = new ManualClock();
  clocksByObjectName.set(objectName, clock);
  const { COORDINATION } = env as TestEnv;
  return { coordination: new DurableCoordination({ namespace: COORDINATION, objectName }), clock };
});
