import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { lowDiskBytes, type ResourceReading, watchResources } from "./resource-watch.ts";

const gigabyte = 1024 ** 3;

function report(freeDiskBytes: number) {
  return {
    engineMemoryBytes: 180_000_000,
    childProcesses: [],
    dataBytes: 2 * gigabyte,
    freeDiskBytes,
  };
}

/** Lets the promise chain of a read run; the fake source answers at once. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) {
    await Promise.resolve();
  }
}

function setUp(answers: unknown[]) {
  const timers = new FakeTimers();
  const errors: unknown[] = [];
  let reads = 0;
  const watch = watchResources({
    timers,
    read: async () => {
      const answer = answers[Math.min(reads, answers.length - 1)];
      reads += 1;
      if (answer instanceof Error) {
        throw answer;
      }
      return answer;
    },
    onError: (error) => errors.push(error),
  });
  const readings: ResourceReading[] = [];
  watch.on("resources", (reading) => readings.push(reading));
  return { timers, watch, errors, readings, reads: () => reads };
}

verifies("shell.resource-numbers", () => {
  it("reads the report at once and then once a minute", async () => {
    const { timers, watch, readings, reads } = setUp([report(40 * gigabyte)]);
    await settle();
    expect(watch.latest).toMatchObject({ lowDisk: false, at: 0, reason: "interval" });
    timers.advance(59_999);
    await settle();
    expect(reads()).toBe(1);
    timers.advance(1);
    await settle();
    expect(readings.map((reading) => reading.at)).toEqual([0, 60_000]);
    watch.stop();
  });

  it("marks the disk low below 1 GB free, not at 1 GB", async () => {
    const { timers, watch, readings } = setUp([report(lowDiskBytes), report(lowDiskBytes - 1)]);
    await settle();
    timers.advance(60_000);
    await settle();
    expect(readings.map((reading) => reading.lowDisk)).toEqual([false, true]);
    watch.stop();
  });

  it("checks before a run, a download or a model pull", async () => {
    const { watch } = setUp([report(40 * gigabyte), report(0.8 * gigabyte)]);
    await settle();
    const reading = await watch.check("model-pull");
    expect(reading).toMatchObject({ lowDisk: true, reason: "model-pull" });
    expect(watch.latest).toBe(reading);
    watch.stop();
  });

  it("joins a read that is under way instead of reading twice", async () => {
    const { watch, reads } = setUp([report(40 * gigabyte)]);
    const [first, second] = await Promise.all([watch.check("run"), watch.check("download")]);
    expect(first).toBe(second);
    expect(reads()).toBe(1);
    watch.stop();
  });

  it("passes a failed minute's read on and reads again the next minute", async () => {
    const broken = new Error("the engine didn't answer");
    const { timers, watch, errors, readings } = setUp([broken, report(40 * gigabyte)]);
    await settle();
    expect(errors).toEqual([broken]);
    expect(watch.latest).toBeUndefined();
    timers.advance(60_000);
    await settle();
    expect(readings).toHaveLength(1);
    watch.stop();
  });

  it("rejects a check whose read fails or whose report it can't read", async () => {
    const { watch } = setUp([report(40 * gigabyte), new Error("gone"), { dataBytes: -1 }]);
    await settle();
    await expect(watch.check("run")).rejects.toThrow("gone");
    await expect(watch.check("run")).rejects.toThrow("engineMemoryBytes");
    watch.stop();
  });

  it("stops the minute's check and drops readings that arrive later", async () => {
    const { timers, watch, readings, reads } = setUp([report(40 * gigabyte)]);
    watch.stop();
    await settle();
    timers.advance(120_000);
    await settle();
    expect(reads()).toBe(1);
    expect(readings).toEqual([]);
    expect(timers.pending).toBe(0);
  });

  it("runs every listener when one throws, then rejects with its error", async () => {
    const { watch, readings } = setUp([report(40 * gigabyte)]);
    await settle();
    const stopListening = watch.on("resources", () => {
      throw new Error("faulty feature");
    });
    await expect(watch.check("run")).rejects.toThrow("faulty feature");
    watch.on("resources", () => {
      throw new Error("another faulty feature");
    });
    await expect(watch.check("run")).rejects.toThrow(AggregateError);
    stopListening();
    expect(readings).toHaveLength(3);
    watch.stop();
  });
});
