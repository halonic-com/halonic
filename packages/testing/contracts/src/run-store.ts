import type { RunEvent } from "@halonicjs/events";
import type { RunStore } from "@halonicjs/ports";
import { describe, expect, it } from "vitest";
import { completed, entered, eventTime, failed, started, waiting } from "./run-events.ts";

/** Creates an empty store under test. */
export type MakeRunStore = () => Promise<RunStore>;

/** Options for {@link runStoreContract}. */
export interface RunStoreContractOptions {
  /**
   * Waits until `list` has caught up with the log. The port lets the list lag
   * for a short time (on Cloudflare it is filled from an outbox); an adapter
   * whose list never lags leaves this out.
   */
  settleList?: (store: RunStore) => Promise<void>;
}

/** The contract every {@link RunStore} adapter passes. */
export function runStoreContract(
  name: string,
  make: MakeRunStore,
  options: RunStoreContractOptions = {},
): void {
  const settle = options.settleList ?? (async () => {});
  describe(`RunStore contract (contracts.run-store): ${name}`, () => {
    appendCases(make, settle);
    conflictCases(make);
    refusalCases(make);
    readCases(make);
    snapshotCases(make);
    listCases(make, settle);
  });
}

function appendCases(make: MakeRunStore, settle: (store: RunStore) => Promise<void>): void {
  // Ported: old "appends events in order and summarizes runs".
  it("appends events in order and summarizes runs", async () => {
    const store = await make();
    expect(await store.append("r1", 0, [started("r1", { kind: "test" })])).toEqual({
      ok: true,
      lastSeq: 1,
    });
    expect(await store.append("r1", 1, [entered("r1", 2, "a")])).toEqual({ ok: true, lastSeq: 2 });
    await store.append("r1", 2, [completed("r1", 3, { x: 1 })]);
    expect((await store.events("r1")).map((event) => event.seq)).toEqual([1, 2, 3]);
    const summary = await store.get("r1");
    expect(summary?.status).toBe("completed");
    expect(summary?.context).toEqual({ x: 1 });
    expect(summary?.lastSeq).toBe(3);
    expect(summary?.updatedAt).toBe(eventTime(3));
    await settle(store);
    expect((await store.list({ kind: "test" })).map((run) => run.id)).toEqual(["r1"]);
    expect(await store.list({ kind: "run" })).toEqual([]);
    expect(await store.get("nope")).toBeNull();
  });

  it("appends several events in one call", async () => {
    const store = await make();
    const result = await store.append("r1", 0, [started("r1"), entered("r1", 2), waiting("r1", 3)]);
    expect(result).toEqual({ ok: true, lastSeq: 3 });
    expect((await store.get("r1"))?.status).toBe("waiting");
  });

  it("keeps its own copy of the events", async () => {
    const store = await make();
    const first = started("r1");
    await store.append("r1", 0, [first]);
    first.at = "changed";
    const read = await store.events("r1");
    (read[0] as RunEvent).at = "changed again";
    expect((await store.events("r1"))[0]?.at).toBe(eventTime(1));
  });
}

function conflictCases(make: MakeRunStore): void {
  it("reports a conflict when the log has moved on, and changes nothing", async () => {
    const store = await make();
    await store.append("r1", 0, [started("r1"), entered("r1", 2)]);
    expect(await store.append("r1", 0, [started("r1")])).toEqual({
      ok: false,
      reason: "conflict",
      lastSeq: 2,
    });
    expect(await store.append("r1", 1, [entered("r1", 2)])).toEqual({
      ok: false,
      reason: "conflict",
      lastSeq: 2,
    });
    expect(await store.append("r1", 5, [entered("r1", 6)])).toEqual({
      ok: false,
      reason: "conflict",
      lastSeq: 2,
    });
    expect(await store.append("r2", 3, [entered("r2", 4)])).toEqual({
      ok: false,
      reason: "conflict",
      lastSeq: 0,
    });
    expect((await store.events("r1")).map((event) => event.type)).toEqual([
      "run.started",
      "state.entered",
    ]);
    expect(await store.events("r2")).toEqual([]);
  });

  it("lets exactly one of two writers with the same expected seq win", async () => {
    const store = await make();
    await store.append("r1", 0, [started("r1")]);
    const results = await Promise.all([
      store.append("r1", 1, [entered("r1", 2, "a")]),
      store.append("r1", 1, [entered("r1", 2, "b")]),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      { ok: false, reason: "conflict", lastSeq: 2 },
    ]);
    expect(await store.events("r1")).toHaveLength(2);
  });
}

function refusalCases(make: MakeRunStore): void {
  it("refuses a caller's bug with a RangeError, never a conflict, and changes nothing", async () => {
    const store = await make();
    await store.append("r1", 0, [started("r1")]);
    const bugs: [string, number, RunEvent[]][] = [
      ["no events", 1, []],
      ["a gap in the numbers", 1, [entered("r1", 3)]],
      ["numbers out of order", 1, [entered("r1", 3), entered("r1", 2)]],
      ["another run's event", 1, [entered("r2", 2)]],
      ["a negative expected seq", -1, [started("r1")]],
      ["a fractional expected seq", 0.5, [started("r1")]],
      ["a NaN expected seq", Number.NaN, [started("r1")]],
    ];
    for (const [bug, expectedSeq, events] of bugs) {
      await expect(store.append("r1", expectedSeq, events), bug).rejects.toThrow(RangeError);
    }
    expect(await store.events("r1")).toHaveLength(1);
  });
}

function readCases(make: MakeRunStore): void {
  it("reads only the events after a sequence number", async () => {
    const store = await make();
    await store.append("r1", 0, [started("r1"), entered("r1", 2), entered("r1", 3)]);
    expect((await store.events("r1", 1)).map((event) => event.seq)).toEqual([2, 3]);
    expect(await store.events("r1", 3)).toEqual([]);
    expect(await store.events("unknown")).toEqual([]);
    expect(await store.events("unknown", 2)).toEqual([]);
  });
}

function snapshotCases(make: MakeRunStore): void {
  it("stores a snapshot with the events, and keeps the latest one", async () => {
    const store = await make();
    expect(await store.snapshot("r1")).toBeNull();
    await store.append("r1", 0, [started("r1")]);
    expect(await store.snapshot("r1")).toBeNull();
    await store.append("r1", 1, [entered("r1", 2)], { snapshot: { step: 2 } });
    expect(await store.snapshot("r1")).toEqual({ seq: 2, state: { step: 2 } });
    await store.append("r1", 2, [entered("r1", 3)]);
    expect(await store.snapshot("r1")).toEqual({ seq: 2, state: { step: 2 } });
    await store.append("r1", 3, [entered("r1", 4), entered("r1", 5)], { snapshot: { step: 5 } });
    expect(await store.snapshot("r1")).toEqual({ seq: 5, state: { step: 5 } });
  });

  it("stores no snapshot when the append conflicts", async () => {
    const store = await make();
    await store.append("r1", 0, [started("r1")], { snapshot: { step: 1 } });
    await store.append("r1", 0, [started("r1")], { snapshot: { step: "lost" } });
    expect(await store.snapshot("r1")).toEqual({ seq: 1, state: { step: 1 } });
  });
}

function listCases(make: MakeRunStore, settle: (store: RunStore) => Promise<void>): void {
  it("lists summaries newest start first, narrowed by every filter field", async () => {
    const store = await make();
    const at = (seconds: number) => eventTime(seconds, "2026-02-01T00:00:00.000Z");
    await store.append("old", 0, [started("old", { at: at(1), hubId: "a", kind: "test" })]);
    await store.append("mid", 0, [started("mid", { at: at(2), workflowId: "other" })]);
    await store.append("new", 0, [started("new", { at: at(3) }), failed("new", 2)]);
    await store.append("wait", 0, [started("wait", { at: at(0) }), waiting("wait", 2)]);
    await settle(store);
    const ids = async (filter?: Parameters<RunStore["list"]>[0]) =>
      (await store.list(filter)).map((summary) => summary.id);
    expect(await ids()).toEqual(["new", "mid", "old", "wait"]);
    expect(await ids({ hubId: "a" })).toEqual(["old"]);
    expect(await ids({ workflowId: "other" })).toEqual(["mid"]);
    expect(await ids({ kind: "test" })).toEqual(["old"]);
    expect(await ids({ kind: "run" })).toEqual(["new", "mid", "wait"]);
    expect(await ids({ status: "failed" })).toEqual(["new"]);
    expect(await ids({ status: ["running", "waiting"] })).toEqual(["mid", "old", "wait"]);
    expect(await ids({ hubId: "a", kind: "run" })).toEqual([]);
  });
}
