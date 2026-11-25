import { runStoreContract, schedulerContract } from "@halonicjs/testing-contracts";
import { PluginStateRunStore } from "./plugin-run-store.ts";
import { TickScheduler } from "./tick-scheduler.ts";
import { copyingState, testClock } from "./workflow-host.test-helper.ts";

runStoreContract("plugin state", async () => new PluginStateRunStore(copyingState(), "company"));

schedulerContract("plugin state, delivered on the job tick", async (listener) => {
  const clock = testClock();
  const scheduler = new TickScheduler(copyingState(), "company", listener, clock);
  return {
    scheduler,
    clock,
    settle: async () => {
      await scheduler.runDue();
    },
  };
});
