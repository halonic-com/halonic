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
import type { FailedJob, GroupRun, MainRun, MergeSnapshot } from "./snapshot.ts";
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

/** 25 Nov: #5994's group, built on #5969's failed group, failed where the catalog's importer is. */
const deviceCheck = "packages/core/action-catalog/src/device-check.ts";
const generated = "packages/core/action-catalog/src/catalog.generated.ts";
const mainTip = "25041db".padEnd(40, "0");
const head5969Group = "22c474c".padEnd(40, "0");
const studioShell = Array.from(
  { length: 6 },
  (_, index) => `apps/studio/src/shell/part-${index}.tsx`,
);

/** #5994's failed group, on `base`. */
function group5994(base: string, id = 45568740658): GroupRun {
  return {
    id,
    conclusion: "failure",
    branch: `gh-readonly-queue/main/pr-5994-${base}`,
    url: `https://github.com/acme/tools/actions/runs/${id}`,
    createdAt: ago(20),
    failedJobs: [job("Typecheck (adapters-core)", [deviceCheck]), job("trace", [deviceCheck])],
  };
}

/** The newest push run on main, finished with `conclusion`. */
function mainPush(conclusion: string): MainRun {
  return {
    id: 45571446177,
    headSha: mainTip,
    status: "completed",
    conclusion,
    createdAt: ago(30),
    branch: "main",
  };
}

/** #5994's group stacked on #5969's, both out of the queue; #5969 touches `files5969`. */
function stackedDay(files5969: readonly string[], mainRuns: readonly MainRun[]): MergeSnapshot {
  return snapshot({
    pulls: [
      pull(5969, { files: files5969, filesTotal: files5969.length }),
      pull(5994, { files: studioShell, filesTotal: studioShell.length }),
    ],
    groupRuns: [group5994(head5969Group)],
    mergeGroupRuns: [
      {
        id: 45568738718,
        headSha: head5969Group,
        status: "completed",
        conclusion: "failure",
        createdAt: ago(25),
        branch: `gh-readonly-queue/main/pr-5969-${mainTip}`,
      },
    ],
    mainRuns,
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

  test("#5969/#5994: a group stacked on a group whose PR touches the named file holds that PR, no freeze", () => {
    const decision = pass(stackedDay([generated, deviceCheck], [mainPush("success")]));
    expect(decision.state.mainBroken).toBeNull();
    expect(decision.state.board.mainRed).toBeNull();
    expect(decision.state.failedHeads).toEqual({ "5969": headOf(5969) });
    expect(actionsOf(decision, "comment").map((each) => each.number)).toEqual([5969]);
    expect(logText(decision)).toContain("culprit #5969(ahead of #5994 in the group chain)");
  });

  test("the same failure on a group directly on main's tip, no PR touching the file, is main broken", () => {
    const decision = pass(
      snapshot({
        pulls: [pull(5994, { files: studioShell, filesTotal: studioShell.length })],
        groupRuns: [group5994(mainTip)],
        mainRuns: [mainPush("success")],
      }),
    );
    expect(decision.state.failedHeads).toEqual({});
    expect(decision.state.mainBroken?.files).toEqual([deviceCheck]);
    expect(decision.state.board.mainRed).not.toBeNull();
  });

  test("a stacked group no PR explains, with main's push run green, is only suspected, said once", () => {
    const first = pass(stackedDay([generated], [mainPush("success")]));
    expect(first.state.mainBroken).toBeNull();
    expect(first.state.board.mainRed).toBeNull();
    expect(first.state.failedHeads).toEqual({ "5994": headOf(5994) });
    const suspected = `main-broken suspected, not frozen (main push ${mainTip.slice(0, 9)} green)`;
    expect(first.log.filter((line) => line.text === suspected)).toHaveLength(1);
    const facts = stackedDay([generated], [mainPush("success")]);
    const again = pass(
      { ...facts, groupRuns: [group5994(head5969Group, 45568740999)] },
      first.state,
    );
    expect(again.log.filter((line) => line.rule === "main-broken")).toEqual([]);
    expect(again.state.board.mainRed).toBeNull();
  });

  test("a stacked group no PR explains, with main's push run red, is main broken", () => {
    const decision = pass(stackedDay([generated], [mainPush("failure")]));
    expect(decision.state.failedHeads).toEqual({});
    expect(decision.state.mainBroken?.files).toEqual([deviceCheck]);
    expect(decision.state.board.mainRed).not.toBeNull();
  });

  test("a PR ahead with more changed files than were read keeps the group's own hold, no freeze", () => {
    const facts = stackedDay([generated], [mainPush("failure")]);
    const wide = {
      ...facts,
      pulls: [pull(5969, { files: [generated], filesTotal: 140 }), ...facts.pulls.slice(1)],
    };
    const decision = pass(wide);
    expect(decision.state.mainBroken).toBeNull();
    expect(decision.state.failedHeads).toEqual({ "5994": headOf(5994) });
  });
});
