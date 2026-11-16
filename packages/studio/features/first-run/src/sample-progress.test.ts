import type { RunEvent, RunSummary } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import type { SampleStepId, SampleWorkspace } from "./api.ts";
import { SampleProgress, type SampleRuns } from "./sample-progress.ts";

function run(id: string, changes: Partial<RunSummary> = {}): RunSummary {
  return {
    id,
    hubId: "support",
    workflowId: "support-reply",
    kind: "run",
    status: "running",
    ...changes,
  } as RunSummary;
}

/** A runs list a test changes; `logs` holds each run's events and `opened` the pages shown. */
function fakeRuns(initial: readonly RunSummary[], logs: Record<string, RunEvent[]> = {}) {
  let summaries = initial;
  const opened = new Set<string>();
  const listeners = new Set<() => void>();
  const runs: SampleRuns = {
    get state() {
      return {
        runs: summaries.map((summary) => ({ summary, madeToolCalls: false })),
        loaded: true,
        error: undefined,
        workflows: undefined,
      };
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    hasOpened: (id) => opened.has(id),
    source: { log: async (id) => logs[id] ?? [] },
  };
  const notify = () => {
    for (const listener of listeners) listener();
  };
  return {
    runs,
    change(next: readonly RunSummary[]) {
      summaries = next;
      notify();
    },
    open(id: string) {
      opened.add(id);
      notify();
    },
  };
}

function workspace(saved: readonly SampleStepId[] = []) {
  const recordDone = vi.fn();
  const value: SampleWorkspace = { isSample: () => true, doneSteps: () => saved, recordDone };
  return { value, recordDone };
}

async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const answered: RunEvent = { type: "event.received", event: "approve" } as RunEvent;

verifies("first-run.sample-card", () => {
  describe("the steps' done rules", () => {
    it("starts with the steps saved on this device, before any run is listed", () => {
      const progress = new SampleProgress(fakeRuns([]).runs, workspace(["start"]).value);
      expect([...progress.state.done]).toEqual(["start"]);
    });

    it("counts a real support run as step 1, and a test run as nothing", async () => {
      const fake = fakeRuns([run("t1", { kind: "test" })]);
      const saved = workspace();
      const progress = new SampleProgress(fake.runs, saved.value);
      await settled();
      expect(progress.state.done.size).toBe(0);

      fake.change([run("r1", { status: "waiting" })]);
      await settled();
      expect([...progress.state.done]).toEqual(["start"]);
      expect(saved.recordDone).toHaveBeenCalledWith("start");
    });

    it("leaves a run of another workflow out", async () => {
      const progress = new SampleProgress(
        fakeRuns([run("r1", { workflowId: "weekly-report" })]).runs,
        workspace().value,
      );
      await settled();
      expect(progress.state.done.size).toBe(0);
    });

    it("counts an answer in a support run's log as step 2, and none while it waits", async () => {
      const fake = fakeRuns([run("r1", { status: "waiting" })], { r1: [answered] });
      const progress = new SampleProgress(fake.runs, workspace().value);
      await settled();
      expect(progress.state.done.has("decide")).toBe(false);

      fake.change([run("r1", { status: "completed" })]);
      await settled();
      expect(progress.state.done.has("decide")).toBe(true);
    });

    it("counts the page of a finished run as step 3 and offers that run to open", async () => {
      const fake = fakeRuns([run("r1", { status: "completed" })]);
      const progress = new SampleProgress(fake.runs, workspace().value);
      await settled();
      expect(progress.state.finishedRun).toEqual({ kind: "run", hub: "support", id: "r1" });
      expect(progress.state.done.has("see")).toBe(false);

      fake.open("r1");
      await settled();
      expect(progress.state.done.has("see")).toBe(true);
    });

    it("tells its listeners when a step becomes done, and stops once disposed", async () => {
      const fake = fakeRuns([]);
      const progress = new SampleProgress(fake.runs, workspace().value);
      const listener = vi.fn();
      progress.subscribe(listener);
      fake.change([run("r1")]);
      await settled();
      expect(listener).toHaveBeenCalled();

      progress.dispose();
      listener.mockClear();
      fake.change([run("r1"), run("r2", { status: "completed" })]);
      await settled();
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
