import { fixedIds } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { entry, liamApproved, merged, pull, repo } from "../fast-track/fast-track.test-helper.ts";
import type { SnapshotPull } from "../snapshot/shape.ts";
import { engineLock } from "./engine-lock.ts";
import { dryRunExecutors } from "./executors.ts";
import { type LifecyclePassResult, lifecyclePass } from "./lifecycle-pass.ts";
import { PluginStateRunStore } from "./plugin-run-store.ts";
import { copyingState, testClock } from "./workflow-host.test-helper.ts";

const minute = 60_000;
const pr = "acme/tools#7";

/** A company's engine on fresh plugin state, and a pass on a snapshot of `pulls`. */
function setup() {
  const state = copyingState();
  const clock = testClock();
  const deps = {
    state,
    companyId: "company",
    clock,
    ids: fixedIds(),
    lock: engineLock(state, "worker-a"),
    executors: dryRunExecutors,
  };
  const runs = new PluginStateRunStore(state, "company");
  async function pass(pulls: readonly SnapshotPull[], queue = [] as ReturnType<typeof entry>[]) {
    const snapshot = {
      version: 1 as const,
      takenAt: clock.now().toISOString(),
      closedWindowDays: 7,
      repos: [repo(pulls, queue)],
    };
    const result = await lifecyclePass(deps, snapshot);
    if (result === "held-elsewhere") {
      throw new Error("The test's worker should hold the lock.");
    }
    return result;
  }
  return { state, clock, deps, runs, pass };
}

function kinds(result: LifecyclePassResult): string[] {
  return result.actions.map((action) =>
    action.kind === "comment" ? `comment:${action.to}` : action.kind,
  );
}

verifies("paperclip.fast-track-lifecycle", () => {
  it("drives one fast-track pull request through its stages to merged", async () => {
    const { clock, runs, pass } = setup();
    const draft = await pass([pull(7, { draft: true })]);
    expect(kinds(draft)).toEqual(["stage"]);
    expect((await runs.get(`fast-track:${pr}:1`))?.state).toBe("ready");

    clock.advance(10 * minute);
    const review = await pass([pull(7)]);
    expect(kinds(review)).toEqual(["stage", "comment:task"]);
    expect((await runs.get(`fast-track:${pr}:1`))?.state).toBe("review");
    // The nudge is said once per head, however often the pass sees it.
    clock.advance(5 * minute);
    const again = await pass([pull(7)]);
    expect(again.lines).toEqual([]);

    clock.advance(5 * minute);
    await pass([pull(7, liamApproved)]);
    expect((await runs.get(`fast-track:${pr}:1`))?.state).toBe("approved");
    clock.advance(15 * minute);
    const ready = await pass([pull(7, liamApproved)]);
    expect(kinds(ready)).toEqual(["enqueue"]);
    expect(ready.lines[0]).toContain("would queue acme/tools#7 without a jump");

    clock.advance(5 * minute);
    await pass([pull(7, { ...liamApproved, inQueue: true })], [entry(7, 1)]);
    expect((await runs.get(`fast-track:${pr}:1`))?.state).toBe("queued");

    clock.advance(20 * minute);
    const done = await pass([merged(7, 1)]);
    expect(done.lines).toEqual([
      "Fast-track lifecycle (dry run) HAL-7: acme/tools#7 queued -> merged.",
    ]);
    // The ended run is forgotten, and a later pass leaves the merged pull request alone.
    expect(await runs.get(`fast-track:${pr}:1`)).toBeNull();
    expect((await pass([merged(7, 30)])).actions).toEqual([]);
  });

  it("fires the escalation 15 minutes after review, through the run's timer", async () => {
    const { clock, runs, pass } = setup();
    await pass([pull(7)]);
    clock.advance(14 * minute);
    expect(kinds(await pass([pull(7)]))).toEqual(["comment:task"]);
    expect((await runs.get(`fast-track:${pr}:1`))?.state).toBe("review");

    clock.advance(2 * minute);
    const late = await pass([pull(7)]);
    expect((await runs.get(`fast-track:${pr}:1`))?.state).toBe("review_late");
    expect(late.lines).toEqual([
      "Fast-track lifecycle (dry run) HAL-7: would say to the board: still not approved on head abc1234 15 min after it was ready for review: Liam hasn't reviewed it. (HAL-7|acme/tools#7|abc1234def5678900000000000000000000000000|comment:review_escalate).",
    ]);
    // Approval moves the late run on like any other.
    await pass([pull(7, liamApproved)]);
    expect((await runs.get(`fast-track:${pr}:1`))?.state).toBe("approved");
  });

  it("starts a run again in the snapshot's stage after it ended as interrupted", async () => {
    const { runs, pass } = setup();
    await pass([pull(7)]);
    const runId = `fast-track:${pr}:1`;
    const lastSeq = (await runs.get(runId))?.lastSeq ?? 0;
    await runs.append(runId, lastSeq, [
      {
        runId,
        seq: lastSeq + 1,
        at: "2026-11-25T00:01:00.000Z",
        type: "run.failed",
        state: null,
        error: "The engine stopped while the run was running.",
        reason: "interrupted",
      },
    ]);
    const restarted = await pass([pull(7, liamApproved)]);
    expect(restarted.lines).toEqual([
      "Fast-track lifecycle (dry run) HAL-7: acme/tools#7 ready -> approved, started again after an interruption.",
    ]);
    expect((await runs.get(`fast-track:${pr}:2`))?.state).toBe("approved");
  });

  it("runs nothing while another worker's lease holds, and takes it over once it ran out", async () => {
    const { state, clock, deps, pass } = setup();
    await pass([pull(7)]);
    const other = { ...deps, lock: engineLock(state, "worker-b") };
    const snapshot = {
      version: 1 as const,
      takenAt: clock.now().toISOString(),
      closedWindowDays: 7,
      repos: [repo([pull(7)])],
    };
    expect(await lifecyclePass(other, snapshot)).toBe("held-elsewhere");
    clock.advance(6 * minute);
    expect(await lifecyclePass(other, snapshot)).not.toBe("held-elsewhere");
  });

  it("keeps a whole queue's rule input under the 16 KB ToolScript default", async () => {
    const { pass } = setup();
    const pulls = Array.from({ length: 12 }, (_, index) => pull(100 + index, liamApproved));
    const result = await pass(pulls);
    expect(result.inputBytes).toBeLessThan(16 * 1024);
  });
});
