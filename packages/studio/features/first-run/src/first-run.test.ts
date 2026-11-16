import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import type { SampleWorkspace } from "./api.ts";
import { FirstRun } from "./first-run.ts";
import type { SampleRuns } from "./sample-progress.ts";

const runs: SampleRuns = {
  state: { runs: [], loaded: true, error: undefined, workflows: undefined },
  subscribe: () => () => {},
  hasOpened: () => false,
  source: { log: async () => [] },
};

function workspaceThatIs(sample: () => boolean): SampleWorkspace {
  return { isSample: sample, doneSteps: () => [], recordDone: vi.fn() };
}

verifies("first-run.sample-card", () => {
  it("builds the progress only for a folder the device remembers as the sample", () => {
    let sample = false;
    const firstRun = new FirstRun(
      runs,
      workspaceThatIs(() => sample),
    );
    expect(firstRun.isSample).toBe(false);
    expect(firstRun.progress()).toBeUndefined();

    // The window marks the folder after it opened, so the answer is read again each time.
    sample = true;
    const progress = firstRun.progress();
    expect(progress).toBeDefined();
    expect(firstRun.progress()).toBe(progress);
  });

  it("stops following the runs on dispose", () => {
    const stop = vi.fn();
    const firstRun = new FirstRun(
      { ...runs, subscribe: () => stop },
      workspaceThatIs(() => true),
    );
    firstRun.progress();
    firstRun.dispose();
    expect(stop).toHaveBeenCalledOnce();
  });
});
