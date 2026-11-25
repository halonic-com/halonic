import { readFileSync } from "node:fs";
import { fixedIds } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { PrWatcherAction, WatchedPull, WatchedTask } from "../signals/rules/pr-watcher.ts";
import { engineLock } from "./engine-lock.ts";
import { PluginStateRunStore } from "./plugin-run-store.ts";
import { prWatcherLifecyclePass } from "./pr-watcher-lifecycle-pass.ts";
import { copyingState, testClock } from "./workflow-host.test-helper.ts";

const minute = 60_000;
const pr = "acme/tools#7";
const runId = `pr-watcher:${pr}:1`;

/** ACME-7 with its one pull request in `pull`'s state. */
function taskWith(pull: Partial<WatchedPull>): WatchedTask {
  return {
    task: "ACME-7",
    holder: "agent-mateo",
    owner: "agent-mateo",
    running: false,
    openChildren: false,
    parked: false,
    memory: { reported: [], seenUntil: null, heldAt: null, lastCommentAt: null },
    pulls: [
      {
        pr,
        state: "open",
        head: "abc1234def5678900000000000000000000000000",
        ciOkOnHead: "success",
        draft: false,
        conflicting: false,
        inQueue: false,
        retargeted: false,
        latestReview: null,
        githubApproved: false,
        held: false,
        landed: false,
        mergedAt: null,
        ...pull,
      },
    ],
  };
}

const merged = { state: "merged" as const, mergedAt: "2026-11-25T00:20:00.000Z" };

const markDone: PrWatcherAction = {
  kind: "task-update",
  key: `ACME-7|${pr}|done`,
  task: "ACME-7",
  status: "done",
  pulls: [pr],
};

/** A company's engine on fresh plugin state, and a pass on what the watcher read. */
function setup() {
  const state = copyingState();
  const clock = testClock();
  const deps = {
    state,
    companyId: "company",
    clock,
    ids: fixedIds(),
    lock: engineLock(state, "worker-a"),
  };
  const runs = new PluginStateRunStore(state, "company");
  async function pass(tasks: readonly WatchedTask[], actions: readonly PrWatcherAction[] = []) {
    clock.advance(10 * minute);
    const result = await prWatcherLifecyclePass(deps, { tasks, actions });
    if (result === "held-elsewhere") {
      throw new Error("The test's worker should hold the lock.");
    }
    return result;
  }
  return { state, clock, runs, pass };
}

verifies("paperclip.pr-watcher-lifecycle", () => {
  it("moves a pull request's run open -> merged -> green -> done across passes", async () => {
    const { runs, pass } = setup();
    const opened = await pass([taskWith({})]);
    expect(opened.lines).toEqual([`PR watcher lifecycle (dry run) ACME-7: ${pr} new -> open.`]);
    expect((await runs.get(runId))?.state).toBe("open");
    // Nothing new, nothing sent.
    expect((await pass([taskWith({})])).actions).toEqual([]);

    await pass([taskWith(merged)]);
    expect((await runs.get(runId))?.state).toBe("merged");
    await pass([taskWith({ ...merged, landed: true })]);
    expect((await runs.get(runId))?.state).toBe("green");

    const done = await pass([taskWith({ ...merged, landed: true })], [markDone]);
    expect(done.lines).toEqual([`PR watcher lifecycle (dry run) ACME-7: ${pr} green -> done.`]);
    // The ended run is forgotten, and a later pass on the same facts starts none.
    expect(await runs.get(runId)).toBeNull();
    expect((await pass([taskWith({ ...merged, landed: true })], [markDone])).actions).toEqual([]);
  });

  it("never moves a run back, and ends one closed without a merge", async () => {
    const { runs, pass } = setup();
    await pass([taskWith(merged)]);
    // A snapshot that still shows it open moves nothing back.
    expect((await pass([taskWith({})])).actions).toEqual([]);
    expect((await runs.get(runId))?.state).toBe("merged");

    const other = setup();
    await other.pass([taskWith({})]);
    const closed = await other.pass([taskWith({ state: "closed" })]);
    expect(closed.lines).toEqual([`PR watcher lifecycle (dry run) ACME-7: ${pr} open -> closed.`]);
    // A pull request first seen closed gets no run.
    expect((await setup().pass([taskWith({ state: "closed" })])).actions).toEqual([]);
  });

  it("keeps a run while the watcher skips its task, and forgets it after 7 days unread", async () => {
    const { clock, runs, pass } = setup();
    await pass([taskWith({})]);
    clock.advance(6 * 24 * 60 * minute);
    await pass([]);
    expect((await runs.get(runId))?.state).toBe("open");
    clock.advance(24 * 60 * minute);
    await pass([]);
    expect(await runs.get(runId)).toBeNull();
  });

  it("is a pure ToolScript rule", () => {
    const file = new URL("./rules/pr-watcher-lifecycle.ts", import.meta.url);
    const source = readFileSync(file, "utf8");
    const code = source.replace(/^\s*(\/\/|\*|\/\*).*$/gm, "");
    expect(code.match(/^import /gm)).toBeNull();
    expect(code).not.toMatch(
      /\bfetch\(|Date\.now\(|new Date\(|Math\.random|process\.|require\(|globalThis|import\(|\beval\b|\bFunction\(/,
    );
  });
});
