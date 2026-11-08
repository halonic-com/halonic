import { schedulerContract } from "@halonicjs/testing-contracts";
import { newWorld } from "./harness.test-helper.ts";
import { NodeScheduler } from "./scheduler.ts";

schedulerContract("node", async (listener) => {
  const { store, clock, timers } = newWorld();
  const scheduler = new NodeScheduler(listener, {
    store,
    clock,
    setTimer: timers.setTimer,
    // The suite makes the listener fail on purpose; its own tests check what is reported.
    reportError: () => {},
  });
  const settle = async () => {
    timers.fireDue();
    await scheduler.deliverDue();
  };
  return { scheduler, clock, settle };
});
