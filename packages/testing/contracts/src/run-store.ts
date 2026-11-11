import type { RunEvent } from "@halonicjs/events";
import type { AppendResult, RunStore } from "@halonicjs/ports";
import { type ErrorKind, errorKindOf } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
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
  /**
   * Gives a new, empty shared storage, for an adapter whose stores in
   * different processes can share one, such as a run folder that a CLI and
   * a desktop app both write to. The contract then checks that `conflict`
   * holds across stores, and that a stale lock doesn't block a run.
   */
  makeShared?: () => Promise<SharedRunStorage>;
}

/** A storage that several stores share, as several processes would. */
export interface SharedRunStorage {
  /** Opens one more store on this storage, as another process would. */
  open(): RunStore;
  /**
   * Leaves the lock of `runId` behind as a writer that crashed while
   * appending would: `process-gone` from a process on this computer that
   * no longer runs, `too-old` from one taken longer ago than the port's
   * `runLockStaleAfterMs`.
   */
  plantStaleLock(runId: string, why: "process-gone" | "too-old"): Promise<void>;
}

/** The contract every {@link RunStore} adapter passes. */
export function runStoreContract(
  name: string,
  make: MakeRunStore,
  options: RunStoreContractOptions = {},
): void {
  const settle = options.settleList ?? (async () => {});
  verifies("contracts.run-store", () => {
    describe(`RunStore contract: ${name}`, () => {
      appendCases(make, settle);
      conflictCases(make);
      refusalCases(make);
      readCases(make);
      snapshotCases(make);
      listCases(make, settle);
    });
  });
  verifies("contracts.run-store-empty-status", () => {
    describe(`RunStore empty status list: ${name}`, () => {
      emptyStatusCases(make, settle);
    });
  });
  verifies("contracts.run-store-run-id-case", () => {
    describe(`RunStore run id case: ${name}`, () => {
      runIdCaseCases(make, settle);
    });
  });
  verifies("contracts.run-store-started-since", () => {
    describe(`RunStore startedSince: ${name}`, () => {
      startedSinceCases(make, settle);
    });
  });
  const makeShared = options.makeShared;
  if (makeShared !== undefined) {
    verifies("contracts.run-store-shared", () => {
      describe(`RunStore shared storage: ${name}`, () => {
        sharedCases(makeShared);
      });
    });
  }
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

/**
 * The ports may not import std (docs/adr/2026-11-09-api-types-stand-alone.md),
 * so `AppendResult` spells its conflict out. This fails to compile if it ever
 * stops being std's error kind `conflict`.
 */
type ConflictReason = Extract<AppendResult, { ok: false }>["reason"];
const conflictIsAnErrorKind: [ConflictReason] extends [Extract<ErrorKind, "conflict">]
  ? true
  : false = true;

function conflictCases(make: MakeRunStore): void {
  it("reports a conflict as std's error kind conflict", () => {
    expect(conflictIsAnErrorKind).toBe(true);
  });

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

function emptyStatusCases(make: MakeRunStore, settle: (store: RunStore) => Promise<void>): void {
  it("treats an empty status list as no status filter", async () => {
    const store = await make();
    const at = (seconds: number) => eventTime(seconds, "2026-02-01T00:00:00.000Z");
    await store.append("ran", 0, [started("ran", { at: at(1) }), completed("ran", 2)]);
    await store.append("test", 0, [started("test", { at: at(2), kind: "test" })]);
    await settle(store);
    const ids = async (filter: Parameters<RunStore["list"]>[0]) =>
      (await store.list(filter)).map((summary) => summary.id);
    expect(await ids({ status: [] })).toEqual(["test", "ran"]);
    expect(await ids({ status: [], kind: "run" })).toEqual(["ran"]);
  });
}

function startedSinceCases(make: MakeRunStore, settle: (store: RunStore) => Promise<void>): void {
  it("lists only the runs that started at or after startedSince", async () => {
    const store = await make();
    await store.append("jan", 0, [started("jan", { at: "2026-01-31T23:59:59.999Z" })]);
    await store.append("feb", 0, [started("feb", { at: "2026-02-01T00:00:00.000Z" })]);
    await store.append("mar", 0, [
      started("mar", { at: "2026-03-01T00:00:00.000Z", kind: "test" }),
    ]);
    await settle(store);
    const ids = async (filter: Parameters<RunStore["list"]>[0]) =>
      (await store.list(filter)).map((summary) => summary.id);
    expect(await ids({ startedSince: "2026-02-01T00:00:00.000Z" })).toEqual(["mar", "feb"]);
    expect(await ids({ startedSince: "2026-02-01T01:00:00+01:00" })).toEqual(["mar", "feb"]);
    expect(await ids({ startedSince: "2026-02-01T00:00:00.000Z", kind: "run" })).toEqual(["feb"]);
    expect(await ids({ startedSince: "2026-04-01T00:00:00.000Z" })).toEqual([]);
  });
}

function sharedCases(makeShared: () => Promise<SharedRunStorage>): void {
  it("lets exactly one of two stores on one storage win, round after round", async () => {
    const storage = await makeShared();
    const [first, second] = [storage.open(), storage.open()];
    await first.append("r1", 0, [started("r1")]);
    for (let seq = 1; seq <= 10; seq += 1) {
      const results = await Promise.all([
        first.append("r1", seq, [entered("r1", seq + 1, "first")]),
        second.append("r1", seq, [entered("r1", seq + 1, "second")]),
      ]);
      expect(
        results.filter((result) => result.ok),
        `round ${seq}`,
      ).toHaveLength(1);
      expect(
        results.filter((result) => !result.ok),
        `round ${seq}`,
      ).toEqual([{ ok: false, reason: "conflict", lastSeq: seq + 1 }]);
    }
    expect((await second.events("r1")).map((event) => event.seq)).toEqual(
      Array.from({ length: 11 }, (_, index) => index + 1),
    );
  });

  for (const why of ["process-gone", "too-old"] as const) {
    it(`appends past a stale lock left by a crashed writer (${why})`, async () => {
      const storage = await makeShared();
      const store = storage.open();
      await store.append("r1", 0, [started("r1")]);
      await storage.plantStaleLock("r1", why);
      expect(await store.append("r1", 1, [entered("r1", 2)])).toEqual({ ok: true, lastSeq: 2 });
      // The lock is released again, so the next writer isn't held up either.
      expect(await storage.open().append("r1", 2, [entered("r1", 3)])).toEqual({
        ok: true,
        lastSeq: 3,
      });
    });
  }
}

function runIdCaseCases(make: MakeRunStore, settle: (store: RunStore) => Promise<void>): void {
  it("treats a run id in another case as another run, and never changes a run through it", async () => {
    const store = await make();
    const own = [started("run_x"), entered("run_x", 2)];
    await store.append("run_x", 0, own, { snapshot: { step: 2 } });
    await settle(store);
    const ownSummary = await store.get("run_x");
    expect(await store.events("RUN_X")).toEqual([]);
    expect(await store.snapshot("RUN_X")).toBeNull();
    expect(await store.get("RUN_X")).toBeNull();

    // A store that keeps the two apart stores the new run; a folder that
    // ignores case can't, so its store refuses it as invalid input, since
    // trying again can't help. Never a conflict from the other run's log.
    const other = started("RUN_X", { at: eventTime(5) });
    const answer = await store.append("RUN_X", 0, [other]).then(
      (result) => ({ stored: result }),
      (error: unknown) => ({ refused: errorKindOf(error) }),
    );
    await settle(store);
    if ("refused" in answer) {
      expect(answer.refused).toBe("invalid_input");
      expect(await store.events("RUN_X")).toEqual([]);
      expect((await store.list()).map((run) => run.id)).toEqual(["run_x"]);
    } else {
      expect(answer.stored).toEqual({ ok: true, lastSeq: 1 });
      expect(await store.events("RUN_X")).toEqual([other]);
      expect((await store.list()).map((run) => run.id)).toEqual(["RUN_X", "run_x"]);
    }
    expect(await store.events("run_x")).toEqual(own);
    expect(await store.snapshot("run_x")).toEqual({ seq: 2, state: { step: 2 } });
    expect(await store.get("run_x")).toEqual(ownSummary);
    expect((await store.list()).find((run) => run.id === "run_x")).toEqual(ownSummary);
  });
}
