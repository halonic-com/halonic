import { routineRunId } from "@halonicjs/app";
import { parseFile } from "@halonicjs/format";
import type { Coordination, ScheduledTimer, Scheduler, SchedulerListener } from "@halonicjs/ports";
import { fixedIds } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { secretsWith } from "./agent/turn-test-kit.test-helper.ts";
import { KernelBlobs, KernelRuns, replyWorkflow } from "./kernel/kernel-test-kit.test-helper.ts";
import { localEngine } from "./local-engine.ts";
import { ScriptedModel, textAnswer } from "./testing/scripted-model.ts";

/** A scheduler whose timers and ticks a test delivers, which remembers that it was closed. */
class TestScheduler implements Scheduler {
  readonly timers = new Map<string, ScheduledTimer>();
  readonly listener: SchedulerListener;
  closed = false;

  constructor(listener: SchedulerListener) {
    this.listener = listener;
  }

  async schedule(key: string, timerId: string, at: string): Promise<void> {
    this.timers.set(JSON.stringify([key, timerId]), { key, timerId, at });
  }

  async cancel(key: string, timerId: string): Promise<void> {
    this.timers.delete(JSON.stringify([key, timerId]));
  }

  async pending(key: string): Promise<ScheduledTimer[]> {
    return [...this.timers.values()].filter((timer) => timer.key === key);
  }

  /** Delivers every timer set until none is left. */
  async runDue(): Promise<void> {
    while (this.timers.size > 0) {
      const due = [...this.timers.values()];
      this.timers.clear();
      for (const timer of due) {
        await this.listener.onTimer(timer);
      }
    }
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

/** The value part of `Coordination` in memory; the routine scheduler uses nothing else. */
class TestCoordination implements Coordination {
  readonly values = new Map<string, string>();

  async read(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async compareAndSet(key: string, expected: string | null, next: string | null): Promise<boolean> {
    if ((this.values.get(key) ?? null) !== expected) return false;
    if (next === null) this.values.delete(key);
    else this.values.set(key, next);
    return true;
  }

  tryAcquire(): never {
    throw new Error("Not used by the routine scheduler.");
  }

  renew(): never {
    throw new Error("Not used by the routine scheduler.");
  }

  release(): never {
    throw new Error("Not used by the routine scheduler.");
  }

  increment(): never {
    throw new Error("Not used by the routine scheduler.");
  }

  countInWindow(): never {
    throw new Error("Not used by the routine scheduler.");
  }
}

const morningReply = [
  "id: morning",
  "name: Morning reply",
  'trigger: { schedule: "0 8 * * *" }',
  "run: { workflow: reply, input: { from: support } }",
].join("\n");

/** The routine of `text` in the `acme` hub, parsed as a workspace routine file would be. */
function placed(text: string) {
  const parsed = parseFile("routine", text, { id: "morning" });
  if (!parsed.ok) throw new Error(parsed.error.map((problem) => problem.message).join("; "));
  return { hub: "acme", routine: parsed.value.value };
}

const workspaceId = "ws-acme-1";

function setUp(createScheduler: (listener: SchedulerListener) => TestScheduler) {
  let now = Date.parse("2026-11-03T07:59:30Z");
  const runs = new KernelRuns();
  const engine = localEngine({
    createScheduler,
    executor: {
      resolveModel: async () => ({
        provider: new ScriptedModel([textAnswer("Dear support")]),
        model: "scripted-1",
      }),
      halonicTools: [],
      connectors: [],
      secrets: secretsWith(),
      clock: { now: () => new Date(now) },
      runs: {
        store: runs,
        blobs: new KernelBlobs(),
        ids: fixedIds(),
        definitionsOf: async () => ({ workflow: replyWorkflow }),
      },
    },
    routines: {
      workspaceId,
      coordination: new TestCoordination(),
      routines: async () => [placed(morningReply)],
    },
  });
  const tickAt = (iso: string) => {
    now = Date.parse(iso);
    return engine.scheduler.listener.onTick(iso);
  };
  return { engine, runs, tickAt };
}

verifies("engine.local-engine-routines", () => {
  const runId = routineRunId(workspaceId, "acme/morning", new Date("2026-11-03T08:00:00Z"));

  it("starts a due routine on a tick, and runs it from the scheduler's timers", async () => {
    const { engine, runs, tickAt } = setUp((listener) => new TestScheduler(listener));

    await tickAt("2026-11-03T07:59:30Z");
    await tickAt("2026-11-03T08:00:20Z");

    expect(await runs.get(runId)).toMatchObject({
      status: "running",
      trigger: { type: "schedule", routineId: "acme/morning", at: "2026-11-03T08:00:00.000Z" },
    });
    await engine.scheduler.runDue();
    expect(await runs.get(runId)).toMatchObject({
      status: "completed",
      context: { reply: "Dear support" },
    });
  });

  it("starts no routine run once closed, and closes the scheduler", async () => {
    const { engine, runs, tickAt } = setUp((listener) => new TestScheduler(listener));
    await tickAt("2026-11-03T07:59:30Z");

    await engine.close();
    await tickAt("2026-11-03T08:00:20Z");

    expect(engine.scheduler.closed).toBe(true);
    expect(await runs.get(runId)).toBeNull();
  });

  it("fails a tick or timer that comes while the scheduler is being made", async () => {
    const early: Promise<void>[] = [];
    setUp((listener) => {
      early.push(listener.onTick("2026-11-03T07:59:30Z"));
      early.push(listener.onTimer({ key: "r-1", timerId: "call:call-1", at: "" }));
      return new TestScheduler(listener);
    });

    for (const call of early) {
      await expect(call).rejects.toThrow("The local engine is still starting");
    }
  });
});
