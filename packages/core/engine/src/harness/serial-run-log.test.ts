import { describe, expect, it } from "vitest";
import { steppingClock } from "../agent/turn-test-kit.test-helper.ts";
import { KernelRuns } from "../kernel/kernel-test-kit.test-helper.ts";
import { SerialRunLog } from "./serial-run-log.ts";

describe("SerialRunLog", () => {
  it("appends events given at the same time one after the other, in order", async () => {
    const runs = new KernelRuns();
    const log = new SerialRunLog(runs, "run_1", 0, steppingClock());

    await Promise.all([
      log.append({ type: "state.entered", state: "a" }),
      log.append({ type: "state.entered", state: "b" }),
    ]);

    expect(runs.logs.get("run_1")?.map((event) => [event.seq, event.type])).toEqual([
      [1, "state.entered"],
      [2, "state.entered"],
    ]);
  });

  it("refuses to write when another writer moved the log on, and every append after it", async () => {
    const runs = new KernelRuns();
    const log = new SerialRunLog(runs, "run_1", 3, steppingClock());

    const first = log.append({ type: "state.entered", state: "a" });
    const second = log.append({ type: "state.entered", state: "b" });

    await expect(first).rejects.toThrow("moved on to event 0");
    await expect(second).rejects.toThrow("moved on");
  });
});
