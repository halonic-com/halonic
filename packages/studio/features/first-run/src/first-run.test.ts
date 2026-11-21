import type { RunEvent, RunSummary } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { FirstRunDevice } from "./api.ts";
import { FirstRun, type FirstRunRuns } from "./first-run.ts";
import type { FirstRunState } from "./first-run-state.ts";

const folder = "/docs/Acme sample";
const opened = new Date("2026-11-21T09:00:00.000Z");

/** A device that keeps what was saved, starting from `saved`. */
function deviceWith(saved?: FirstRunState): FirstRunDevice & { saved: string | undefined } {
  const device = {
    folder,
    saved: saved === undefined ? undefined : JSON.stringify(saved),
    read: () => device.saved,
    write: (text: string) => {
      device.saved = text;
    },
  };
  return device;
}

/** A support run of the demo, started a minute after it opened unless told otherwise. */
function supportRun(overrides: Partial<RunSummary>): RunSummary {
  return {
    id: "run_1",
    hubId: "support",
    workflowId: "support-reply",
    kind: "run",
    status: "running",
    startedAt: "2026-11-21T09:01:00.000Z",
    ...overrides,
  } as RunSummary;
}

/** The runs list in memory: `show` lists runs, newest first, and tells the listeners. */
function runsList(logs: Record<string, () => Promise<RunEvent[]>> = {}) {
  const listeners = new Set<() => void>();
  let state: FirstRunRuns["state"] = {
    runs: [],
    loaded: true,
    error: undefined,
    workflows: undefined,
  };
  const runs: FirstRunRuns & { show(...summaries: RunSummary[]): void } = {
    get state() {
      return state;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    source: { log: (runId) => logs[runId]?.() ?? Promise.resolve([]) },
    show(...summaries) {
      state = { ...state, runs: summaries.map((summary) => ({ summary })) };
      for (const listener of [...listeners]) listener();
    },
  };
  return runs;
}

const answered = (event: string) => async () => [
  { type: "event.received", event } as unknown as RunEvent,
];

/** Lets the runs' promises settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function started(runs = runsList(), device = deviceWith()) {
  const firstRun = new FirstRun(runs, { isSample: () => true }, device, () => opened);
  firstRun.notice();
  return { firstRun, runs, device };
}

verifies("first-run.state", () => {
  it("turns on in the demo the first time it shows, and saves that on the device", () => {
    const { firstRun, device } = started();
    expect(firstRun.state).toMatchObject({ kind: "on", folder, step: "demo" });
    expect(firstRun.isOnHere).toBe(true);
    expect(JSON.parse(device.saved ?? "")).toEqual(firstRun.state);
  });

  it("stays off in a folder that isn't the demo", () => {
    const firstRun = new FirstRun(
      runsList(),
      { isSample: () => false },
      deviceWith(),
      () => opened,
    );
    firstRun.notice();
    expect(firstRun.state).toEqual({ kind: "off" });
  });

  it("isn't on here when its first run is in another folder", () => {
    const elsewhere: FirstRunState = { kind: "on", folder: "/docs/Other", since: "", step: "run" };
    const firstRun = new FirstRun(
      runsList(),
      { isSample: () => true },
      deviceWith(elsewhere),
      () => opened,
    );
    firstRun.notice();
    expect(firstRun.state).toEqual(elsewhere);
    expect(firstRun.isOnHere).toBe(false);
  });

  it("follows the newest real support run: started, waiting, failed", async () => {
    const { firstRun, runs } = started();
    runs.show(supportRun({ status: "running" }));
    await settle();
    expect(firstRun.state).toMatchObject({ step: "run" });
    runs.show(supportRun({ status: "waiting" }));
    await settle();
    expect(firstRun.state).toMatchObject({ step: "approve" });
    runs.show(supportRun({ id: "run_2", status: "failed", startedAt: "2026-11-21T09:05:00.000Z" }));
    await settle();
    expect(firstRun.state).toMatchObject({ step: "run", failed: true });
  });

  it("leaves out test runs and runs from before it began", async () => {
    const { firstRun, runs } = started();
    runs.show(
      supportRun({ kind: "test", status: "waiting" }),
      supportRun({ id: "old", status: "waiting", startedAt: "2026-11-20T09:00:00.000Z" }),
    );
    await settle();
    expect(firstRun.state).toMatchObject({ step: "demo" });
  });

  it("goes off at the first win, a run that finished after Approve, and remembers it", async () => {
    const device = deviceWith();
    const { firstRun, runs } = started(runsList({ run_1: answered("approve") }), device);
    runs.show(supportRun({ status: "completed" }));
    await settle();
    expect(firstRun.state).toEqual({ kind: "done", folder });
    const afterRestart = new FirstRun(runsList(), { isSample: () => true }, device, () => opened);
    afterRestart.notice();
    expect(afterRestart.state).toEqual({ kind: "done", folder });
  });

  it("counts a rejected reply as a run that ended without a win", async () => {
    const { firstRun, runs } = started(runsList({ run_1: answered("reject") }));
    runs.show(supportRun({ status: "completed" }));
    await settle();
    expect(firstRun.state).toMatchObject({ kind: "on", step: "run", ended: true });
  });

  it("reads a log that couldn't be read again on the next change", async () => {
    let reads = 0;
    const flaky = async () => {
      reads += 1;
      if (reads === 1) throw new Error("The engine isn't answering.");
      return answered("approve")();
    };
    const { firstRun, runs } = started(runsList({ run_1: flaky }));
    runs.show(supportRun({ status: "completed" }));
    await settle();
    expect(firstRun.state).toMatchObject({ kind: "on" });
    runs.show(supportRun({ status: "completed" }));
    await settle();
    expect(firstRun.state).toMatchObject({ kind: "done" });
  });

  it("drops a log read that a newer run overtook while it was read", async () => {
    let finishRead: (log: RunEvent[]) => void = () => undefined;
    const slow = () =>
      new Promise<RunEvent[]>((resolve) => {
        finishRead = resolve;
      });
    const { firstRun, runs } = started(runsList({ run_1: slow }));
    runs.show(supportRun({ status: "completed" }));
    await settle();
    const newer = supportRun({
      id: "run_2",
      status: "waiting",
      startedAt: "2026-11-21T09:05:00.000Z",
    });
    runs.show(newer, supportRun({ status: "completed" }));
    await settle();
    expect(firstRun.state).toMatchObject({ kind: "on", step: "approve" });
    const heard: FirstRunState[] = [];
    firstRun.subscribe(() => heard.push(firstRun.state));
    finishRead([{ type: "event.received", event: "reject" } as unknown as RunEvent]);
    await settle();
    expect(heard).toEqual([]);
    expect(firstRun.state).toMatchObject({ kind: "on", step: "approve" });
  });

  it("catches up with the runs when Continue takes it up again", async () => {
    const { firstRun, runs } = started();
    firstRun.send({ kind: "left" });
    runs.show(supportRun({ status: "waiting" }));
    await settle();
    expect(firstRun.state).toMatchObject({ kind: "paused", step: "demo" });
    firstRun.send({ kind: "resumed" });
    await settle();
    expect(firstRun.state).toMatchObject({ kind: "on", step: "approve" });
  });

  it("tells its listeners about a change, and nothing after dispose", () => {
    const { firstRun } = started();
    const heard: string[] = [];
    firstRun.subscribe(() => heard.push(firstRun.state.kind));
    firstRun.send({ kind: "left" });
    firstRun.send({ kind: "left" });
    firstRun.dispose();
    firstRun.send({ kind: "resumed" });
    expect(heard).toEqual(["paused"]);
  });
});
