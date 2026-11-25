import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { loadSignals, type SignalPlan } from "./load.ts";
import { emptySignalState, type SignalExecutors, type SignalState, signalPass } from "./pass.ts";
import type { PrWatcherAction } from "./rules/pr-watcher.ts";

const now = "2026-11-25T10:00:00Z";
const pr = "acme/website#7";

const actions: PrWatcherAction[] = [
  {
    kind: "wake",
    key: `${pr} abc1234 ci-red`,
    task: "ACME-1",
    pr,
    head: "abc1234ff",
    reason: "ci-red",
  },
  {
    kind: "wake",
    key: `${pr} abc1234 conflict`,
    task: "ACME-1",
    pr,
    head: "abc1234ff",
    reason: "conflict",
  },
  {
    kind: "task-update",
    key: "ACME-2|acme/website#8|done",
    task: "ACME-2",
    status: "done",
    pulls: ["acme/website#8"],
  },
];

/** Executors that record every write. */
function recorder() {
  const writes: string[] = [];
  const executors: SignalExecutors = {
    wake: async (task, wakes) => {
      writes.push(`wake ${task} ${wakes.map((wake) => wake.reason).join(",")}`);
      return `woke ${task}`;
    },
    "task-update": async (action) => {
      writes.push(`${action.status} ${action.task}`);
      return `updated ${action.task}`;
    },
  };
  return { writes, executors };
}

function plan(signals: unknown): SignalPlan {
  return loadSignals(signals).plans.get("pr-watcher") as SignalPlan;
}

const fileSignal = [{ version: 1, id: "watcher", rule: { run: "pr-watcher" } }];

async function pass(of: SignalPlan, state: SignalState, executors: SignalExecutors) {
  return signalPass({ plan: of, actions, tasks: ["ACME-1", "ACME-2"], state, executors, now });
}

verifies("paperclip.signals", () => {
  test("a new writing signal makes no writes in its first pass, then writes once", async () => {
    const { writes, executors } = recorder();
    const first = await pass(plan(fileSignal), emptySignalState, executors);
    expect(first.dryRun).toBe(true);
    expect(writes).toEqual([]);
    expect(first.lines).toEqual([
      `Signal pr-watcher (dry run): would wake ACME-1 for ci-red on ${pr} (${pr} abc1234 ci-red).`,
      `Signal pr-watcher (dry run): would wake ACME-1 for conflict on ${pr} (${pr} abc1234 conflict).`,
      "Signal pr-watcher (dry run): would mark ACME-2 done (ACME-2|acme/website#8|done).",
    ]);
    const second = await pass(plan(fileSignal), first.state, executors);
    expect(second.dryRun).toBe(false);
    expect(writes).toEqual(["done ACME-2", "wake ACME-1 ci-red,conflict"]);
    await pass(plan(fileSignal), second.state, executors);
    expect(writes).toHaveLength(2);
  });

  test("a changed signal, or one that asks for it, runs dry again", async () => {
    const { writes, executors } = recorder();
    const live = (await pass(plan(fileSignal), emptySignalState, executors)).state;
    const changed = [{ ...fileSignal[0], rule: { run: "pr-watcher", with: { done: false } } }];
    expect((await pass(plan(changed), live, executors)).dryRun).toBe(true);
    const dry = [{ ...fileSignal[0], dryRun: true }];
    const once = await pass(plan(dry), live, executors);
    expect((await pass(plan(dry), once.state, executors)).dryRun).toBe(true);
    expect(writes).toEqual([]);
  });

  test("the built-in defaults write from the first pass, and forget the keys of tasks no longer watched", async () => {
    const { writes, executors } = recorder();
    const first = await pass(plan(undefined), emptySignalState, executors);
    expect(first.dryRun).toBe(false);
    expect(writes).toHaveLength(2);
    const later = await signalPass({
      plan: plan(undefined),
      actions: [],
      tasks: ["ACME-2"],
      state: first.state,
      executors,
      now,
    });
    expect(Object.keys(later.state.done)).toEqual(["ACME-2|acme/website#8|done"]);
  });

  test("a write that throws is logged and tried again, and the writes around it are never sent twice", async () => {
    const { writes, executors } = recorder();
    const failing: SignalExecutors = {
      ...executors,
      "task-update": async () => {
        throw new Error("Paperclip answered 503");
      },
    };
    const first = await pass(plan(undefined), emptySignalState, failing);
    expect(writes).toEqual(["wake ACME-1 ci-red,conflict"]);
    expect(first.lines).toContain(
      "Signal pr-watcher: marking ACME-2 done failed, tried again next pass: Paperclip answered 503",
    );
    await pass(plan(undefined), first.state, executors);
    expect(writes).toEqual(["wake ACME-1 ci-red,conflict", "done ACME-2"]);
  });
});
