import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import {
  actionsOf,
  ago,
  enqueued,
  entry,
  headOf,
  logText,
  now,
  pass,
  pull,
  snapshot,
  stateWith,
} from "./merge-control.test-helper.ts";
import type { FailedJob, GroupRun } from "./snapshot.ts";
import { emptyMergeState } from "./state.ts";

/** The files #5723 brought to main, which the Leak guard failed on (24 Nov, 21:22 UTC). */
const leakFiles = [
  "tooling/paperclip/src/merge-control/state.ts",
  "tooling/paperclip/src/merge-control/reruns.test.ts",
  "tooling/paperclip/src/merge-control/fill.test.ts",
];

function job(name: string, annotatedFiles?: readonly string[]): FailedJob {
  return {
    id: name.length,
    name,
    url: `https://github.com/acme/tools/actions/runs/45489425553/job/${name.length}`,
    failedSteps: ["Run the guard"],
    ...(annotatedFiles === undefined ? {} : { annotatedFiles }),
  };
}

/** #5762's merge group, failed in `jobs`. */
function group(jobs: readonly FailedJob[]): GroupRun {
  return {
    id: 45489425553,
    conclusion: "failure",
    branch: `gh-readonly-queue/main/pr-5762-${headOf(5762)}`,
    url: "https://github.com/acme/tools/actions/runs/45489425553",
    createdAt: ago(20),
    failedJobs: jobs,
  };
}

/** Twelve pull requests that have nothing to do with it, queued. */
const unrelated = Array.from({ length: 12 }, (_, index) => 5763 + index);

function leakGuardDay(jobs: readonly FailedJob[]) {
  return snapshot({
    pulls: [pull(5762), ...unrelated.map((number) => pull(number))],
    queue: unrelated.map((number, index) => entry(number, index + 1)),
    groupRuns: [group(jobs)],
  });
}

verifies("paperclip.merge-control-main-broken", () => {
  test("24 Nov Leak guard: a group failing only on #5723's files is main broken, the freeze starts and no PR is held", () => {
    const decision = pass(leakGuardDay([job("Leak guard", leakFiles)]));
    expect(decision.state.failedHeads).toEqual({});
    expect(decision.state.mainBroken).toEqual({
      since: now.toISOString(),
      run: "https://github.com/acme/tools/actions/runs/45489425553",
      files: leakFiles,
    });
    expect(decision.state.board.mainRed).toEqual({
      since: now.toISOString(),
      allowRe: "^revert\\b",
    });
    expect(actionsOf(decision, "dequeue")).toEqual([]);
    expect(actionsOf(decision, "comment")).toEqual([]);
    expect(enqueued(decision)).toEqual([]);
    expect(decision.state.lastQueue).toEqual(unrelated);
    expect(logText(decision)).toContain(
      `culprit #5762(not this PR: main broken in ${leakFiles.join(", ")})`,
    );
    expect(decision.log.filter((line) => line.rule === "main-broken")).toHaveLength(1);
  });

  test("main broken is said once, and a green push run on main ends it with the freeze", () => {
    const first = pass(leakGuardDay([job("Leak guard", leakFiles)]));
    const nextGroup = { ...group([job("Leak guard", leakFiles)]), id: 45489975089 };
    const again = pass(snapshot({ pulls: [pull(5762)], groupRuns: [nextGroup] }), first.state);
    expect(again.log.filter((line) => line.rule === "main-broken")).toEqual([]);
    expect(again.state.mainBroken).toEqual(first.state.mainBroken);
    const green = pass(
      snapshot({
        mainRuns: [
          {
            id: 1,
            headSha: "f".repeat(40),
            status: "completed",
            conclusion: "success",
            createdAt: new Date(now.getTime() + 60_000).toISOString(),
            branch: "main",
          },
        ],
      }),
      first.state,
    );
    expect(green.state.board.mainRed).toBeNull();
    expect(green.state.mainBroken).toBeNull();
  });

  test("a freeze the board already set is kept", () => {
    const board = { ...emptyMergeState.board, mainRed: { since: ago(30), allowRe: "HAL-17876" } };
    const decision = pass(leakGuardDay([job("Leak guard", leakFiles)]), stateWith({ board }));
    expect(decision.state.board.mainRed).toEqual(board.mainRed);
    expect(decision.state.mainBroken?.files).toEqual(leakFiles);
  });

  test("a failed job with no file annotations keeps the culprit hold", () => {
    for (const jobs of [[job("Test (core)")], [job("Test (core)", [])]]) {
      const decision = pass(leakGuardDay(jobs));
      expect(decision.state.failedHeads).toEqual({ "5762": headOf(5762) });
      expect(decision.state.mainBroken).toBeNull();
      expect(decision.state.board.mainRed).toBeNull();
    }
    const mixed = pass(leakGuardDay([job("Leak guard", leakFiles), job("Test (core)")]));
    expect(mixed.state.failedHeads).toEqual({ "5762": headOf(5762) });
  });

  test("mixed jobs, one naming a file the blamed PR touches, keep the culprit hold", () => {
    const own = pull(5762).files[0] ?? "";
    const decision = pass(
      leakGuardDay([job("Leak guard", leakFiles), job("Lint", [own, "docs/other.md"])]),
    );
    expect(decision.state.failedHeads).toEqual({ "5762": headOf(5762) });
    expect(decision.state.mainBroken).toBeNull();
    expect(actionsOf(decision, "comment").map((each) => each.number)).toEqual([5762]);
  });

  test("a pull request with more changed files than were read keeps the culprit hold", () => {
    const facts = leakGuardDay([job("Leak guard", leakFiles)]);
    const wide = { ...facts, pulls: [pull(5762, { filesTotal: 140 }), ...facts.pulls.slice(1)] };
    expect(pass(wide).state.failedHeads).toEqual({ "5762": headOf(5762) });
  });
});
