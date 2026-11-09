import { type RunEvent, type RunEventBody, type RunSummary, summarize } from "@halonicjs/events";
import type { AppendResult, RunFilter, RunSnapshot, RunStore } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { endInterruptedRuns, interruptedError } from "./end-interrupted-runs.ts";

const now = new Date("2026-11-09T14:00:00.000Z");
const clock = { now: () => new Date(now) };

/**
 * A run store in memory, with the real append check. `beforeRead` and
 * `beforeAppend` let a test write first, as another writer would.
 */
class MemoryRuns implements RunStore {
  readonly logs = new Map<string, RunEvent[]>();
  beforeRead: (runId: string) => void = () => {};
  beforeAppend: (runId: string) => void = () => {};

  /** Adds a run whose log is these event bodies, numbered and stamped in order. */
  add(runId: string, bodies: RunEventBody[]): void {
    this.logs.set(
      runId,
      bodies.map((body, index) => ({
        ...body,
        runId,
        seq: index + 1,
        at: `2026-11-09T13:0${index}:00.000Z`,
      })),
    );
  }

  async append(
    runId: string,
    expectedSeq: number,
    events: readonly RunEvent[],
  ): Promise<AppendResult> {
    this.beforeAppend(runId);
    const log = this.logs.get(runId) ?? [];
    if (log.length !== expectedSeq) return { ok: false, reason: "conflict", lastSeq: log.length };
    this.logs.set(runId, [...log, ...events]);
    return { ok: true, lastSeq: log.length + events.length };
  }

  async events(runId: string): Promise<RunEvent[]> {
    this.beforeRead(runId);
    return [...(this.logs.get(runId) ?? [])];
  }

  async snapshot(): Promise<RunSnapshot | null> {
    return null;
  }

  async get(runId: string): Promise<RunSummary | null> {
    return summarize(this.logs.get(runId) ?? []);
  }

  async list(filter?: RunFilter): Promise<RunSummary[]> {
    const summaries = await Promise.all([...this.logs.keys()].map((runId) => this.get(runId)));
    return summaries.filter((summary): summary is RunSummary => summary?.status === filter?.status);
  }
}

const started: RunEventBody = {
  type: "run.started",
  hubId: "acme",
  workflowId: "invoices",
  input: {},
  kind: "run",
  definitionsVersion: "v1",
};

verifies("engine.end-interrupted-runs", () => {
  it("ends a run that was going with run.failed, reason interrupted, in the state it was in", async () => {
    const store = new MemoryRuns();
    store.add("run_going", [started, { type: "state.entered", state: "pay" }]);

    expect(await endInterruptedRuns(store, clock)).toEqual(["run_going"]);

    expect(store.logs.get("run_going")?.at(-1)).toEqual({
      runId: "run_going",
      seq: 3,
      at: now.toISOString(),
      type: "run.failed",
      state: "pay",
      error: interruptedError,
      reason: "interrupted",
    });
    expect((await store.get("run_going"))?.status).toBe("failed");
  });

  it("leaves waiting runs and ended runs as they are", async () => {
    const store = new MemoryRuns();
    store.add("run_waiting", [
      started,
      { type: "state.entered", state: "approve" },
      { type: "run.waiting", state: "approve", events: ["approved"] },
    ]);
    store.add("run_done", [started, { type: "run.completed", state: "pay", context: {} }]);
    const before = structuredClone([...store.logs]);

    expect(await endInterruptedRuns(store, clock)).toEqual([]);
    expect([...store.logs]).toEqual(before);
  });

  it("leaves a run that ended between the list and the read of its log", async () => {
    const store = new MemoryRuns();
    store.add("run_ending", [started, { type: "state.entered", state: "pay" }]);
    store.beforeRead = (runId) => {
      store.beforeRead = () => {};
      store.logs.get(runId)?.push({
        runId,
        seq: 3,
        at: "2026-11-09T14:00:00.000Z",
        type: "run.completed",
        state: "pay",
        context: {},
      });
    };

    expect(await endInterruptedRuns(store, clock)).toEqual([]);
    expect(store.logs.get("run_ending")?.map((event) => event.type)).toEqual([
      "run.started",
      "state.entered",
      "run.completed",
    ]);
  });

  it("leaves a run whose log moved on while it ran, because something still writes to it", async () => {
    const store = new MemoryRuns();
    store.add("run_alive", [started, { type: "state.entered", state: "pay" }]);
    store.beforeAppend = (runId) => {
      store.beforeAppend = () => {};
      store.logs.get(runId)?.push({
        runId,
        seq: 3,
        at: "2026-11-09T14:00:00.000Z",
        type: "transition",
        from: "pay",
        to: "notify",
        event: "paid",
      });
    };

    expect(await endInterruptedRuns(store, clock)).toEqual([]);
    expect(store.logs.get("run_alive")?.at(-1)?.type).toBe("transition");
  });
});
