import type { RunEvent } from "@halonicjs/events";
import { runStoreContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { DryRunRunStore } from "./dry-run-run-store.ts";
import { MemoryRunStore } from "./run-store.ts";

runStoreContract("dry run over memory", async () => new DryRunRunStore(new MemoryRunStore()));

const at = "2026-02-01T00:00:00.000Z";

/** A `run.started` event, the first of every run. */
function started(runId: string): RunEvent {
  return {
    runId,
    seq: 1,
    at,
    type: "run.started",
    hubId: "hub",
    workflowId: "flow",
    input: {},
    kind: "run",
    definitionsVersion: "v1",
  };
}

/** A `state.entered` event with sequence number `seq`. */
function entered(runId: string, seq: number): RunEvent {
  return { runId, seq, at, type: "state.entered", state: "a" };
}

/** A real store holding run `r1` with one event and a snapshot. */
async function realStore(): Promise<MemoryRunStore> {
  const real = new MemoryRunStore();
  await real.append("r1", 0, [started("r1")], { snapshot: { step: 1 } });
  return real;
}

verifies("memory.dry-run-run-store", () => {
  it("never changes the store under it", async () => {
    const real = await realStore();
    const store = new DryRunRunStore(real);
    await store.append("r1", 1, [entered("r1", 2)], { snapshot: { step: 2 } });
    await store.append("r2", 0, [started("r2")]);
    expect((await real.events("r1")).map((event) => event.seq)).toEqual([1]);
    expect(await real.snapshot("r1")).toEqual({ seq: 1, state: { step: 1 } });
    expect(await real.get("r2")).toBeNull();
    expect((await real.list()).map((summary) => summary.id)).toEqual(["r1"]);
  });

  it("continues a real run, and reads its real and pending events together", async () => {
    const store = new DryRunRunStore(await realStore());
    expect(await store.snapshot("r1")).toEqual({ seq: 1, state: { step: 1 } });
    expect(await store.append("r1", 0, [started("r1")])).toEqual({
      ok: false,
      reason: "conflict",
      lastSeq: 1,
    });
    expect(await store.append("r1", 1, [entered("r1", 2), entered("r1", 3)])).toEqual({
      ok: true,
      lastSeq: 3,
    });
    expect((await store.events("r1")).map((event) => event.seq)).toEqual([1, 2, 3]);
    expect((await store.events("r1", 2)).map((event) => event.seq)).toEqual([3]);
    expect((await store.get("r1"))?.lastSeq).toBe(3);
    // No snapshot came with the pending events, so the real one is still the latest.
    expect(await store.snapshot("r1")).toEqual({ seq: 1, state: { step: 1 } });
    expect((await store.list()).map((summary) => summary.lastSeq)).toEqual([3]);
  });

  it("keeps its own view of a run when another writer appends to the real store", async () => {
    const real = await realStore();
    const store = new DryRunRunStore(real);
    await store.append("r1", 1, [entered("r1", 2)]);
    await real.append("r1", 1, [entered("r1", 2), entered("r1", 3)], { snapshot: { step: 3 } });
    expect((await store.events("r1")).map((event) => event.seq)).toEqual([1, 2]);
    expect((await store.events("r1", 1)).map((event) => event.seq)).toEqual([2]);
    expect((await store.get("r1"))?.lastSeq).toBe(2);
    // The real snapshot is at seq 3, past the dry run's base, so it is not shown.
    expect(await store.snapshot("r1")).toBeNull();
    expect(await store.append("r1", 2, [entered("r1", 3)])).toEqual({ ok: true, lastSeq: 3 });
  });

  it("records every append that succeeded, in the order asked", async () => {
    const store = new DryRunRunStore(await realStore());
    await store.append("r2", 0, [started("r2")]);
    await store.append("r1", 0, [started("r1")]);
    await store.append("r1", 1, [entered("r1", 2)]);
    const changes = store.changes();
    expect(changes).toEqual([
      { runId: "r2", events: [started("r2")] },
      { runId: "r1", events: [entered("r1", 2)] },
    ]);
    changes.pop();
    expect(store.changes()).toHaveLength(2);
    expect(Object.isFrozen(store.changes()[0])).toBe(true);
    expect(Object.isFrozen(store.changes()[0]?.events)).toBe(true);
  });
});
