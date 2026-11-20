import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { MAX_SIGNAL_CHAIN, type RunLinks, signalLoop } from "./signal-loop.ts";

/** A run store of named runs, counting the reads the guard makes. */
function store(runs: Record<string, RunLinks>) {
  const reads: string[] = [];
  const read = async (runId: string) => {
    reads.push(runId);
    return Object.hasOwn(runs, runId) ? (runs[runId] ?? null) : null;
  };
  return { read, reads };
}

const scheduled = (routine: string): RunLinks => ({
  parentRunId: null,
  trigger: { type: "schedule", routineId: `@workspace/${routine}` },
});
const signalled = (routine: string, sender: string): RunLinks => ({
  parentRunId: null,
  trigger: { type: "signal", routineId: `@workspace/${routine}`, signalId: `${sender}:7` },
});
const childOf = (parent: string): RunLinks => ({ parentRunId: parent, trigger: null });

/** A chain `a-0` (scheduled) → `a-1` → … → `a-<starts>`, each started by the one before. */
function chain(starts: number): Record<string, RunLinks> {
  const runs: Record<string, RunLinks> = { "a-0": scheduled("a") };
  for (let n = 1; n <= starts; n += 1) {
    runs[`a-${n}`] = signalled(n % 2 === 0 ? "a" : "b", `a-${n - 1}`);
  }
  return runs;
}

verifies("routines.signal-loop", () => {
  it("refuses a signal from the routine's own run", async () => {
    const { read } = store({ "x-1": scheduled("x") });
    expect(await signalLoop("@workspace/x", "x-1", read)).toEqual({ kind: "itself" });
  });

  it("counts a child run of the routine's run as the routine's own", async () => {
    const { read } = store({ "x-1": scheduled("x"), "x-1-child": childOf("x-1") });
    expect(await signalLoop("@workspace/x", "x-1-child", read)).toEqual({ kind: "itself" });
  });

  it("refuses the routine's own signal however its run was started", async () => {
    const { read } = store({ "y-1": scheduled("y"), "x-1": signalled("x", "y-1") });
    expect(await signalLoop("@workspace/x", "x-1", read)).toEqual({ kind: "itself" });
  });

  it("lets another routine's signal start the routine", async () => {
    const { read } = store({ "y-1": scheduled("y") });
    expect(await signalLoop("@workspace/x", "y-1", read)).toBeNull();
  });

  it("lets a run started by hand start the routine", async () => {
    const { read } = store({ "m-1": { parentRunId: null, trigger: null } });
    expect(await signalLoop("@workspace/x", "m-1", read)).toBeNull();
  });

  it("lets two routines start each other while the chain is short", async () => {
    // a-0 (A, scheduled) → a-1 (B) → a-2 (A); a-2's signal would start B again.
    const { read } = store(chain(2));
    expect(await signalLoop("@workspace/b", "a-2", read)).toBeNull();
  });

  it(`runs a chain of ${MAX_SIGNAL_CHAIN} signal starts and refuses the next`, async () => {
    expect(MAX_SIGNAL_CHAIN).toBe(4);
    // a-3's signal makes the fourth start; a-4's would make the fifth.
    const fourth = store(chain(3));
    expect(await signalLoop("@workspace/c", "a-3", fourth.read)).toBeNull();
    const fifth = store(chain(4));
    expect(await signalLoop("@workspace/c", "a-4", fifth.read)).toEqual({
      kind: "chain",
      length: 5,
    });
  });

  it("follows child runs on every step of the chain", async () => {
    const runs = {
      "a-0": scheduled("a"),
      "a-0-child": childOf("a-0"),
      "a-1": signalled("b", "a-0-child"),
      "a-1-child": childOf("a-1"),
      "a-2": signalled("a", "a-1-child"),
      "a-2-child": childOf("a-2"),
      "a-3": signalled("b", "a-2-child"),
      "a-3-child": childOf("a-3"),
      "a-4": signalled("a", "a-3-child"),
      "a-4-child": childOf("a-4"),
    };
    const { read } = store(runs);
    expect(await signalLoop("@workspace/c", "a-4-child", read)).toEqual({
      kind: "chain",
      length: 5,
    });
  });

  it("ends the chain at a run the store no longer has", async () => {
    const { read } = store({ "a-1": signalled("b", "gone") });
    expect(await signalLoop("@workspace/c", "a-1", read)).toBeNull();
    expect(await signalLoop("@workspace/c", "gone", read)).toBeNull();
  });

  it("refuses a chain that comes back to a run it has met", async () => {
    const { read } = store({ "a-1": signalled("a", "a-2"), "a-2": signalled("b", "a-1") });
    expect(await signalLoop("@workspace/c", "a-1", read)).toEqual({ kind: "chain", length: 3 });
  });

  it("refuses a child run whose parents come back to it", async () => {
    const { read } = store({ "a-1": childOf("a-2"), "a-2": childOf("a-1") });
    expect(await signalLoop("@workspace/c", "a-1", read)).toEqual({ kind: "chain", length: 1 });
  });

  it("reads one run per step, and stops reading once it refuses", async () => {
    const { read, reads } = store(chain(6));
    await signalLoop("@workspace/c", "a-6", read);
    expect(reads).toEqual(["a-6", "a-5", "a-4", "a-3"]);
  });

  it("finds the sending run of a signal whose run id holds a colon", async () => {
    const { read } = store({
      "x:1": scheduled("x"),
      "y-1": { parentRunId: null, trigger: { type: "signal", signalId: "x:1:3" } },
    });
    expect(await signalLoop("@workspace/z", "y-1", read)).toBeNull();
    expect(await signalLoop("@workspace/x", "x:1", read)).toEqual({ kind: "itself" });
  });
});
