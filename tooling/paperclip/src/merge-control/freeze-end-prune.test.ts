import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { restRun } from "./facts.test-helper.ts";
import { boundedCache } from "./facts-cache.ts";
import { mainRunsOf } from "./facts-runs.ts";
import {
  ago,
  enqueued,
  headOf,
  logText,
  pass,
  pull,
  snapshot,
  stateWith,
} from "./merge-control.test-helper.ts";
import type { GroupRun, MainRun } from "./snapshot.ts";
import { emptyMergeState } from "./state.ts";

/** A freeze for revert pull requests that began an hour ago. */
const frozen = stateWith({
  board: { ...emptyMergeState.board, mainRed: { since: ago(60), allowRe: "^revert\\b" } },
});

/** A red push run on main, 20 minutes old, with these jobs red. */
function redPushRun(redJobs?: readonly string[]): MainRun {
  return {
    id: 7101,
    headSha: "b".repeat(40),
    status: "completed",
    conclusion: "failure",
    createdAt: ago(20),
    branch: "main",
    ...(redJobs === undefined ? {} : { redJobs }),
  };
}

/** A finished merge group created `minutes` ago. */
function groupRun(conclusion: string, minutes: number): GroupRun {
  return {
    id: 7200 + minutes,
    conclusion,
    branch: `gh-readonly-queue/main/pr-1-${headOf(1)}`,
    url: `https://github.com/acme/tools/actions/runs/${7200 + minutes}`,
    createdAt: ago(minutes),
    failedJobs: [],
  };
}

const flaky = "Android device keys (emulator)";
const followers = ["ci-ok", "Cancel the run on the first failure"];

verifies("paperclip.merge-control-freeze-end-prune", () => {
  test("red-main freeze ends on flaky-only push run", () => {
    const pulls = [pull(1)];
    const flakyOnly = pass(
      snapshot({ pulls, mainRuns: [redPushRun([flaky, ...followers])] }),
      frozen,
    );
    expect(flakyOnly.state.board.mainRed).toBeNull();
    expect(enqueued(flakyOnly)).toEqual([1]);
    expect(logText(flakyOnly)).toContain(`only known-flaky jobs failed: ${flaky}`);

    for (const redJobs of [[flaky, "Test (core)", ...followers], followers, undefined]) {
      const held = pass(snapshot({ pulls, mainRuns: [redPushRun(redJobs)] }), frozen);
      expect(held.state.board.mainRed).toEqual(frozen.board.mainRed);
      expect(enqueued(held)).toEqual([]);
    }
  });

  test("the reader names the red jobs of main's newest finished push run, once per attempt", async () => {
    const asked: string[] = [];
    const runs = [
      restRun(7103, { event: "push", status: "in_progress", conclusion: null, created_at: ago(5) }),
      restRun(7102, { event: "push", conclusion: "failure", created_at: ago(20) }),
      restRun(7101, { event: "push", conclusion: "failure", created_at: ago(40) }),
    ];
    const jobs = [
      { id: 1, name: flaky, conclusion: "failure" },
      { id: 2, name: "Lint", conclusion: "success" },
      { id: 3, name: "Build", conclusion: "skipped" },
      { id: 4, name: "Test (core)", conclusion: "timed_out" },
    ];
    const get = async (path: string) => {
      asked.push(path);
      return path.includes("/jobs") ? { jobs } : { workflow_runs: runs };
    };
    const cache = boundedCache<string[]>();
    const read = await mainRunsOf(get, "acme/tools", cache);
    expect(read.map((run) => run.redJobs)).toEqual([undefined, [flaky, "Test (core)"], undefined]);
    await mainRunsOf(get, "acme/tools", cache);
    expect(asked.filter((path) => path.includes("/jobs"))).toEqual([
      "/repos/acme/tools/actions/runs/7102/jobs?filter=latest&per_page=100",
    ]);
  });

  test("red-main freeze ends on green merge group", () => {
    const pulls = [pull(1)];
    const after = pass(snapshot({ pulls, groupRuns: [groupRun("success", 30)] }), frozen);
    expect(after.state.board.mainRed).toBeNull();
    expect(logText(after)).toContain(
      "MAIN_RED_END (green merge group https://github.com/acme/tools/actions/runs/7230)",
    );

    const before = pass(
      snapshot({ pulls, groupRuns: [groupRun("success", 90), groupRun("failure", 30)] }),
      frozen,
    );
    expect(before.state.board.mainRed).toEqual(frozen.board.mainRed);
  });

  test("state pruned on closed PR or new head", () => {
    const cooldown = (number: number) => ({ head: headOf(number), ahead: [9], at: ago(30) });
    const stale = stateWith({
      // #1 merged, #2 closed, #3 has a new head, #4 is open on the same head.
      failedHeads: { "1": headOf(1), "2": headOf(2), "3": headOf(3), "4": headOf(4) },
      cooldown: { "1": cooldown(1), "3": cooldown(3), "4": cooldown(4) },
    });
    const open = [
      { number: 3, branch: "mateo/HAL-3-thing", base: "main", head: headOf(3, 1) },
      { number: 4, branch: "mateo/HAL-4-thing", base: "main", head: headOf(4) },
    ];
    const merged = [{ number: 1, mergedAt: ago(10) }];
    const pruned = pass(snapshot({ open, merged }), stale);
    expect(pruned.state.failedHeads).toEqual({ "4": headOf(4) });
    expect(pruned.state.cooldown).toEqual({ "4": cooldown(4) });
    expect(logText(pruned)).toContain("PRUNED failedHeads=#1,#2,#3 cooldown=#1,#3");

    const unread = pass(snapshot({ open: null, merged }), stale);
    expect(unread.state.failedHeads).toEqual(stale.failedHeads);
    expect(unread.state.cooldown).toEqual(stale.cooldown);
  });
});
