import type { RunSummary } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import type { FirstRunDevice, SampleWorkspace } from "./api.ts";
import { FirstRun, type FirstRunRuns } from "./first-run.ts";

const demo = "/docs/Acme sample";
const other = "/docs/Acme notes";
const opened = new Date("2026-11-21T09:00:00.000Z");

/**
 * The page's storage on this device, shared by every open folder; `full` makes writes fail.
 * `fromAnotherWindow` saves as a folder in another window does, which the page hears as an event.
 */
function deviceStorage() {
  const storage = { saved: undefined as string | undefined, full: false };
  const listeners = new Set<() => void>();
  const deviceFor = (folder: string): FirstRunDevice => ({
    folder,
    read: () => storage.saved,
    write: (text) => {
      if (!storage.full) storage.saved = text;
    },
    onChanged: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
  const fromAnotherWindow = (act: () => void) => {
    act();
    for (const listener of [...listeners]) listener();
  };
  return { storage, deviceFor, fromAnotherWindow };
}

/** A runs list with no runs until `show` lists some. */
function runsList() {
  const listeners = new Set<() => void>();
  let runs: { summary: RunSummary }[] = [];
  const list: FirstRunRuns & { show(summary: RunSummary): void } = {
    get state() {
      return { runs, loaded: true, error: undefined, workflows: undefined };
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    source: { log: () => Promise.resolve([]) },
    show(summary) {
      runs = [{ summary }];
      for (const listener of [...listeners]) listener();
    },
  };
  return list;
}

/** A folder Recent may remember as the demo later: `mark` does, and tells the watcher. */
function sampleFolder(isSample: boolean) {
  const listeners = new Set<() => void>();
  const sample: Pick<SampleWorkspace, "isSample" | "onMarkedSample"> & { mark(): void } = {
    isSample: () => isSample,
    onMarkedSample: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    mark() {
      isSample = true;
      for (const listener of [...listeners]) listener();
    },
  };
  return sample;
}

function openFolder(device: FirstRunDevice, sample = sampleFolder(false), runs = runsList()) {
  const firstRun = new FirstRun(runs, sample, device, () => opened);
  firstRun.notice();
  return firstRun;
}

/** Lets the runs' promises settle: a waiting run's step takes a few promise turns, far fewer than 10. */
async function settle() {
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
}

verifies("first-run.one-state", () => {
  it("reads what another open folder changed when it is shown again", () => {
    const { deviceFor } = deviceStorage();
    const inDemo = openFolder(deviceFor(demo), sampleFolder(true));
    const beside = openFolder(deviceFor(other));
    const changes = vi.fn();
    beside.subscribe(changes);

    inDemo.send({ kind: "left" });
    beside.notice();

    expect(beside.state).toMatchObject({ kind: "paused", folder: demo });
    expect(changes).toHaveBeenCalledOnce();
  });

  it("reads what a folder in another window saved without being shown again", () => {
    const { deviceFor, fromAnotherWindow } = deviceStorage();
    const inDemo = openFolder(deviceFor(demo), sampleFolder(true));
    const beside = openFolder(deviceFor(other));
    const changes = vi.fn();
    beside.subscribe(changes);

    fromAnotherWindow(() => inDemo.send({ kind: "left" }));

    expect(beside.state).toMatchObject({ kind: "paused", folder: demo });
    expect(changes).toHaveBeenCalledOnce();
  });

  it("doesn't start the first run in the demo on another window's change, nor after closing", () => {
    const { storage, deviceFor, fromAnotherWindow } = deviceStorage();
    const inDemo = openFolder(deviceFor(demo), sampleFolder(true));
    const closed = openFolder(deviceFor(other));
    closed.dispose();
    const changes = vi.fn();
    closed.subscribe(changes);

    // Start over in another window turns it off before its new copy of the demo starts it.
    fromAnotherWindow(() => {
      storage.saved = '{"kind":"off"}';
    });

    expect(inDemo.state.kind).toBe("off");
    expect(storage.saved).toBe('{"kind":"off"}');
    expect(changes).not.toHaveBeenCalled();
  });

  it("applies an action to the state the device holds now, not to the folder's old copy", () => {
    const { storage, deviceFor } = deviceStorage();
    const inDemo = openFolder(deviceFor(demo), sampleFolder(true));
    const beside = openFolder(deviceFor(other));

    beside.showGuide();
    inDemo.send({ kind: "left" });

    expect(inDemo.state).toMatchObject({ kind: "on", folder: other, step: "demo" });
    expect(inDemo.isOnHere).toBe(false);
    expect(JSON.parse(storage.saved ?? "")).toMatchObject({ kind: "on", folder: other });
  });

  it("doesn't move the first run by a run of a folder it has left", async () => {
    const { storage, deviceFor } = deviceStorage();
    const runs = runsList();
    openFolder(deviceFor(demo), sampleFolder(true), runs);
    openFolder(deviceFor(other)).showGuide();

    runs.show({
      id: "run_1",
      hubId: "support",
      workflowId: "support-reply",
      kind: "run",
      status: "waiting",
      startedAt: "2026-11-21T09:01:00.000Z",
    } as RunSummary);
    await settle();

    expect(JSON.parse(storage.saved ?? "")).toMatchObject({ folder: other, step: "demo" });
  });

  it("keeps its own change when the device couldn't save it", () => {
    const { storage, deviceFor } = deviceStorage();
    const inDemo = openFolder(deviceFor(demo), sampleFolder(true));
    storage.full = true;

    inDemo.send({ kind: "left" });
    inDemo.notice();

    expect(inDemo.state).toMatchObject({ kind: "paused", folder: demo });
  });

  it("starts the first run when an open folder becomes the demo", () => {
    const { deviceFor } = deviceStorage();
    const sample = sampleFolder(false);
    const firstRun = openFolder(deviceFor(demo), sample);
    expect(firstRun.state.kind).toBe("off");

    sample.mark();

    expect(firstRun.state).toMatchObject({ kind: "on", folder: demo, step: "demo" });
  });

  it("stops watching for the demo when the workspace closes", () => {
    const { deviceFor } = deviceStorage();
    const sample = sampleFolder(false);
    const firstRun = openFolder(deviceFor(demo), sample);

    firstRun.dispose();
    sample.mark();

    expect(firstRun.state.kind).toBe("off");
  });
});
