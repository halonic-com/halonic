import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { startScheduler } from "./harness.test-helper.ts";

const second = 1000;
const minute = 60 * second;

verifies("scheduler-node.closed", () => {
  it("rejects schedule and cancel after close, and writes nothing", async () => {
    const s = startScheduler();
    await s.scheduler.schedule("run_1", "wait", s.inMs(second));
    await s.scheduler.close();
    const append = s.store.append.bind(s.store);
    let writes = 0;
    s.store.append = async (changes) => {
      writes += 1;
      await append(changes);
    };
    await expect(s.scheduler.schedule("run_1", "later", s.inMs(minute))).rejects.toThrow(
      "The scheduler is closed.",
    );
    await expect(s.scheduler.cancel("run_1", "wait")).rejects.toThrow("The scheduler is closed.");
    expect(writes).toBe(0);
    expect(s.timers.pendingCount).toBe(0);
  });
});
