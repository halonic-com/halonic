/**
 * The `Scheduler` contract against `DurableScheduler` and the real `RunObject`
 * alarm, inside workerd. The suite moves a clock the objects read. It starts
 * ten years ahead of real time, so workerd never fires an alarm by itself
 * before the suite asks (an alarm in the real past would fire at once, and
 * that is fine too: the handler only delivers what the suite's clock says is due).
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
import {
  cases,
  SuiteClock,
  type TestRoutinesObject,
  type TestRunObject,
} from "./test-run-object.ts";

export { TestRoutinesObject, TestRunObject } from "./test-run-object.ts";

/** What the runner binds for this suite (see `scheduler.test.ts`). */
interface TestEnv {
  RUNS: DurableObjectNamespace<TestRunObject>;
  ROUTINES: DurableObjectNamespace<TestRoutinesObject>;
}

/** The Scheduler contract never appends, so no run list update is ever sent. */
const noRunList = { publish: async () => {} };

schedulerContract("durable object", async (listener) => {
  const caseId = crypto.randomUUID();
  const clock = new SuiteClock();
  const objectNames = new Set<string>();
  cases.set(caseId, { clock, listener, runList: noRunList, objectNames });
  const { RUNS, ROUTINES } = env as TestEnv;
  const scheduler = new DurableScheduler({ namespace: RUNS, namePrefix: caseId });
  return {
    scheduler,
    clock,
    async settle() {
      await Promise.all(
        [...objectNames].map((name) => RUNS.get(RUNS.idFromName(name)).fireAlarm()),
      );
      // The cron's tick, through the real routines object. A tick that rejects is not retried: the next tick catches up.
      await ROUTINES.get(ROUTINES.idFromName(caseId))
        .tick(clock.now().toISOString())
        .catch(() => undefined);
    },
  };
});
