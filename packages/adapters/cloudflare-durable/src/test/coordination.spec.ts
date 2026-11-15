/**
 * The `Coordination` contract against `DurableCoordination`, inside workerd.
 * The Durable Object here is `CoordinationObject` with a clock the suite
 * moves: the suite gives the object its time over RPC before the first call
 * after the clock moved, so the spec runs the same where the object has an
 * isolate of its own. Every `make()` uses a new object name, so each case
 * starts empty.
 */

import { env } from "cloudflare:workers";
import { coordinationContract } from "@halonicjs/testing-contracts";
import { DurableCoordination } from "../durable-coordination.ts";
import { SuiteCase } from "./suite-case.ts";
import { TestCoordinationObject } from "./test-coordination-object.ts";

export { TestCoordinationObject };

/** What the runner binds for this suite (see `coordination.test.ts`). */
interface TestEnv {
  COORDINATION: DurableObjectNamespace<TestCoordinationObject>;
}

coordinationContract("durable object", async () => {
  const objectName = crypto.randomUUID();
  const suiteCase = new SuiteCase();
  const { COORDINATION } = env as TestEnv;
  const namespace = suiteCase.namespace(COORDINATION);
  return {
    coordination: new DurableCoordination({ namespace, objectName }),
    clock: suiteCase.clock,
  };
});
