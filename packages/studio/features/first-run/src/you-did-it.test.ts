import type { RunEvent, RunSummary } from "@halonicjs/events";
import type { WaitItem } from "@halonicjs/studio-feature-inbox/api";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { FirstRun, type FirstRunRuns } from "./first-run.ts";
import type { FirstRunState } from "./first-run-state.ts";
import { youDidItFacts, youDidItSource } from "./you-did-it.ts";

const folder = "/docs/Acme sample";
const view = { view: "YouDidItView", load: async () => ({}) };

function supportRun(overrides: Partial<RunSummary>): RunSummary {
  return {
    id: "run_1",
    hubId: "support",
    workflowId: "support-reply",
    kind: "run",
    status: "waiting",
    startedAt: "2026-11-21T09:01:00.000Z",
    endedAt: null,
    statesVisited: ["sort", "write", "review"],
    cost: 0,
    unpricedCalls: 0,
    ...overrides,
  } as RunSummary;
}

/** The first run on at Approve in the demo, over runs that `show` replaces. */
function firstRunAt(saved: FirstRunState, logs: Record<string, RunEvent[]> = {}) {
  let text: string | undefined = JSON.stringify(saved);
  const listeners = new Set<() => void>();
  let state: FirstRunRuns["state"] = {
    runs: [],
    loaded: true,
    error: undefined,
    workflows: undefined,
  };
  const runs: FirstRunRuns = {
    get state() {
      return state;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    source: { log: async (runId) => logs[runId] ?? [] },
  };
  const device = { folder, read: () => text, write: (next: string) => (text = next) };
  const firstRun = new FirstRun(runs, { isSample: () => true }, device, () => new Date(0));
  const show = (...summaries: RunSummary[]) => {
    state = { ...state, runs: summaries.map((summary) => ({ summary })) };
    for (const listener of [...listeners]) listener();
  };
  return { firstRun, show };
}

const on: FirstRunState = {
  kind: "on",
  folder,
  since: "2026-11-21T09:00:00.000Z",
  step: "approve",
};
const card = (runId: string) => ({ kind: "wait", runId }) as WaitItem;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

verifies("first-run.you-did-it", () => {
  it("claims only an Approve that finished the first run's run", () => {
    const { firstRun, show } = firstRunAt(on);
    const older = supportRun({ id: "run_0", startedAt: "2026-11-21T08:00:00.000Z" });
    show(supportRun({}), older);
    const source = youDidItSource(firstRun, view);
    expect(source.claims(card("run_1"), "approve", "finished")).toBe(true);
    expect(source.claims(card("run_1"), "reject", "ended")).toBe(false);
    expect(source.claims(card("run_1"), "approve", "continues")).toBe(false);
    expect(source.claims(card("run_0"), "approve", "finished")).toBe(false);
  });

  it("still claims the run once its win moved the first run to done, and no other", async () => {
    const approved = [{ type: "event.received", event: "approve" } as unknown as RunEvent];
    const { firstRun, show } = firstRunAt(on, { run_1: approved });
    show(supportRun({ status: "completed" }));
    await settle();
    expect(firstRun.state.kind).toBe("done");
    const source = youDidItSource(firstRun, view);
    expect(source.claims(card("run_1"), "approve", "finished")).toBe(true);
    expect(source.claims(card("run_2"), "approve", "finished")).toBe(false);
  });

  it("claims nothing in another folder, or once the first run is done without a win seen here", () => {
    const elsewhere = firstRunAt({ ...on, folder: "/docs/Other" });
    elsewhere.show(supportRun({}));
    expect(
      youDidItSource(elsewhere.firstRun, view).claims(card("run_1"), "approve", "finished"),
    ).toBe(false);
    const done = firstRunAt({ kind: "done", folder });
    done.show(supportRun({}));
    expect(youDidItSource(done.firstRun, view).claims(card("run_1"), "approve", "finished")).toBe(
      false,
    );
  });

  it("words the numbers by the run's model path", () => {
    const run = supportRun({
      status: "completed",
      startedAt: "2026-11-21T09:01:00.000Z",
      endedAt: "2026-11-21T09:01:14.000Z",
    });
    expect(youDidItFacts(run, "local", "EUR")).toEqual({
      line: "3 steps · 14 s · no cost, ran on this computer · logged with your yes",
      sample: false,
    });
    expect(youDidItFacts(run, "sample", "EUR")).toEqual({
      line: "3 steps · 14 s · logged with your yes",
      sample: true,
    });
    expect(youDidItFacts({ ...run, cost: 0.02 }, "cloud", "EUR").line).toBe(
      "3 steps · 14 s · estimated cost €0.02 · logged with your yes",
    );
    // A key without a price, or a subscription: no cost part, never "€0.00".
    expect(youDidItFacts(run, "cloud", "EUR").line).toBe("3 steps · 14 s · logged with your yes");
    expect(youDidItFacts({ ...run, statesVisited: ["review"] }, undefined, "EUR").line).toBe(
      "1 step · 14 s · logged with your yes",
    );
  });
});
