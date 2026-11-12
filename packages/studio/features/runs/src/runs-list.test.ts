import { describe, expect, it, vi } from "vitest";
import type { RunsSource, SourcedRun } from "./api.ts";
import { RunsList } from "./runs-list.ts";
import { fakeSource } from "./source.test-helper.ts";
import { summaryWith } from "./summary.test-helper.ts";

const running = summaryWith({ id: "run_a_000001" });
const done = summaryWith({ id: "run_b_000002", status: "completed" });

async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("RunsList", () => {
  it("loads the runs, and again whenever the source says a run changed", async () => {
    const fake = fakeSource([done]);
    const list = new RunsList(fake.source);
    const listener = vi.fn();
    list.subscribe(listener);
    await settled();
    expect(list.state.loaded).toBe(true);
    expect(list.state.runs.map((run) => run.summary.id)).toEqual(["run_b_000002"]);

    fake.change([running, done]);
    await settled();
    expect(list.state.runs).toHaveLength(2);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("has a running dot, read '1 running', only while a run is running", async () => {
    const fake = fakeSource([done]);
    const list = new RunsList(fake.source);
    await settled();
    expect(list.signal()).toBeUndefined();

    fake.change([running, done]);
    await settled();
    expect(list.signal()).toEqual({ mark: "running", value: 1, spoken: "1 running" });
  });

  it("keeps the runs when a later load fails, until one succeeds", async () => {
    const fake = fakeSource([done]);
    const list = new RunsList(fake.source);
    await settled();
    const error = new Error("fetch failed");
    fake.fail(error);
    await list.refresh();
    expect(list.state).toMatchObject({ loaded: true, error });
    expect(list.state.runs).toHaveLength(1);

    fake.answer();
    await list.refresh();
    expect(list.state.error).toBeUndefined();
  });

  it("lets only the last of overlapping loads count", async () => {
    const answers: ((runs: SourcedRun[]) => void)[] = [];
    const source: RunsSource = {
      list: () => new Promise((resolve) => answers.push(resolve)),
      workflow: () => undefined,
      currency: () => "EUR",
      subscribe: () => () => {},
    };
    const list = new RunsList(source);
    const second = list.refresh();
    answers[1]?.([{ summary: running, madeToolCalls: false }]);
    await second;
    answers[0]?.([]);
    await settled();
    expect(list.state.runs).toHaveLength(1);
  });

  it("stops watching and ignores answers once the workspace has closed", async () => {
    const fake = fakeSource([done]);
    const list = new RunsList(fake.source);
    list.dispose();
    await settled();
    fake.change([running]);
    await list.refresh();
    expect(list.state.loaded).toBe(false);
  });
});
