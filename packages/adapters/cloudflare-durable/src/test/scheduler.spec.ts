/**
 * The `Scheduler` contract against `DurableScheduler` and the real `RunObject`
 * alarm, inside workerd. The suite moves a clock the objects read. It starts
 * ten years ahead of real time, so workerd never fires an alarm by itself
 * before the suite asks (an alarm in the real past would fire at once, and
 * that is fine too: the handler only delivers what the suite's clock says is due).
 * The objects read that clock from their own storage and call the suite's listener over RPC,
 * so nothing lives in the suite's isolate.
 *
 * "Fire the alarm" is what `settle()` does for every object the scheduler
 * touched: it runs the object's `alarm()` handler when the alarm the object
 * itself set is due by the suite's clock, as Cloudflare would at that time.
 * Alarms run one at a time, as on Cloudflare. The routine tick is the cron's
 * (build plan part 7), so `settle()` also delivers it, through the real routines object, as the cron would.
 */

import { env } from "cloudflare:workers";
import { schedulerContract } from "@halonicjs/testing-contracts";
import { DurableScheduler } from "../durable-scheduler.ts";
import { SuiteCase } from "./suite-case.ts";
import type { TestRoutinesObject, TestRunObject } from "./test-run-object.ts";

export { TestRoutinesObject, TestRunObject } from "./test-run-object.ts";

/** What the runner binds for this suite (see `scheduler.test.ts`). */
interface TestEnv {
  RUNS: DurableObjectNamespace<TestRunObject>;
  ROUTINES: DurableObjectNamespace<TestRoutinesObject>;
}

schedulerContract("durable object", async (listener) => {
  const caseId = crypto.randomUUID();
  const suiteCase = new SuiteCase({ listener });
  const { RUNS, ROUTINES } = env as TestEnv;
  const scheduler = new DurableScheduler({
    namespace: suiteCase.namespace(RUNS),
    namePrefix: caseId,
  });
  const routines = suiteCase.namespace(ROUTINES);
  return {
    scheduler,
    clock: suiteCase.clock,
    async settle() {
      await suiteCase.fireAlarms(RUNS);
      // The cron's tick, through the real routines object. A tick that rejects is not retried: the next tick catches up.
      await routines
        .get(routines.idFromName(caseId))
        .tick(suiteCase.clock.now().toISOString())
        .catch(() => undefined);
    },
  };
});
