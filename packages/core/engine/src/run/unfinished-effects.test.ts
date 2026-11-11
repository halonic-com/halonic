import { describe, expect, it } from "vitest";
import { NotingScheduler } from "../harness/harness-test-kit.test-helper.ts";
import type { Effect } from "../kernel/decide-types.ts";
import { readRun } from "../kernel/step.ts";
import { replyStart, runsOn } from "./local-runs-test-kit.test-helper.ts";
import { UnfinishedEffects } from "./unfinished-effects.ts";

/** A `set-timer` effect, told apart by its key. */
function timerEffect(key: string): Effect {
  return { type: "set-timer", key, at: "2026-11-11T00:00:00.000Z" };
}

/**
 * Unfinished effects of a started reply run whose `carryOut` notes the keys
 * of the timers it sets. It fails once for each key in `failing`, and waits
 * for the gate of a key in `gates` first, as a slow scheduler would.
 * Reading the run's log throws while `reads.fail` is set.
 */
async function effectsOfStartedRun() {
  const engine = runsOn([]);
  await engine.executor.start(replyStart);
  const run = await readRun(engine.runs, "run_1");
  if (run === null) throw new Error("The run didn't start.");
  const done: string[] = [];
  const failing = new Set<string>();
  const gates = new Map<string, Promise<void>>();
  const reads = { fail: false };
  const effects = new UnfinishedEffects({
    store: {
      events: (runId, afterSeq) => {
        if (reads.fail) throw new Error("the log couldn't be read");
        return engine.runs.events(runId, afterSeq);
      },
      snapshot: (runId) => engine.runs.snapshot(runId),
    },
    scheduler: new NotingScheduler(),
    carryOut: async (_run, effect) => {
      if (effect.type !== "set-timer") return;
      await gates.get(effect.key);
      if (failing.delete(effect.key)) throw new Error(`${effect.key} couldn't be set`);
      done.push(effect.key);
    },
    ended: async () => {},
    now: () => "2026-11-11T00:00:00.000Z",
  });
  return { run, effects, done, failing, gates, reads };
}

describe("UnfinishedEffects", () => {
  it("keeps an older step's effects ahead of a newer step's when both fail at once", async () => {
    const { run, effects, done, failing, gates } = await effectsOfStartedRun();
    failing.add("a");
    await expect(effects.carryOut(run, [timerEffect("a")])).rejects.toThrow("a couldn't be set");

    // A delivery carries out the kept `a`, which fails again once let go ...
    const gate = Promise.withResolvers<void>();
    gates.set("a", gate.promise);
    failing.add("a");
    const resuming = effects.resume(run.runId);
    // ... and meanwhile a newer step keeps `b`.
    failing.add("b");
    await expect(effects.carryOut(run, [timerEffect("b")])).rejects.toThrow("b couldn't be set");
    gate.resolve();
    await expect(resuming).rejects.toThrow("a couldn't be set");

    await effects.resume(run.runId);
    expect(done).toEqual(["a", "b"]);
  });

  it("keeps a step whose run couldn't be read, rather than dropping it", async () => {
    const { run, effects, done, failing, reads } = await effectsOfStartedRun();
    failing.add("a");
    await expect(effects.carryOut(run, [timerEffect("a")])).rejects.toThrow("a couldn't be set");
    reads.fail = true;
    await expect(effects.resume(run.runId)).rejects.toThrow("the log couldn't be read");

    reads.fail = false;
    await effects.resume(run.runId);
    expect(done).toEqual(["a"]);
  });
});
