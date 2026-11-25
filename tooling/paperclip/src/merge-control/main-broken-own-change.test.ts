import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import {
  actionsOf,
  ago,
  enqueued,
  headOf,
  logText,
  pass,
  pull,
  snapshot,
} from "./merge-control.test-helper.ts";
import type { GroupRun, MainRun } from "./snapshot.ts";

/** #6052's files (25 Nov): none of them is one the Leak guard named. */
const files6052 = [
  "tooling/paperclip/src/plugin/chief-line.ts",
  "tooling/paperclip/src/plugin/chief-line-signal.ts",
  "tooling/paperclip/src/plugin/worker.ts",
];

const mainTip = "60262b2".padEnd(40, "0");

/** #6052's merge group, 25 Nov 11:43 UTC: cancelled after the Leak guard failed on `label`. */
function group6052(label: string): GroupRun {
  return {
    id: 45607116418,
    conclusion: "cancelled",
    branch: `gh-readonly-queue/main/pr-6052-${mainTip}`,
    url: "https://github.com/acme/tools/actions/runs/45607116418",
    createdAt: ago(20),
    failedJobs: [
      {
        id: 139180757611,
        name: "Leak guard",
        url: "https://github.com/acme/tools/actions/runs/45607116418/job/139180757611",
        failedSteps: ["Leak guard"],
        annotatedFiles: [label],
        annotationTitles: ["personal-term"],
      },
    ],
  };
}

/** The newest push run on main, finished with `conclusion`. */
function mainPush(conclusion: string): MainRun {
  return {
    id: 45606000000,
    headSha: mainTip,
    status: "completed",
    conclusion,
    createdAt: ago(30),
    branch: "main",
  };
}

/** #6052 out of the queue after its group, and #6053, approved and green, waiting to go in. */
function day(label: string, conclusion: string) {
  return snapshot({
    pulls: [pull(6052, { files: files6052, filesTotal: files6052.length }), pull(6053)],
    groupRuns: [group6052(label)],
    mainRuns: [mainPush(conclusion)],
  });
}

verifies("paperclip.merge-control-main-broken-own-change", () => {
  test("#6052: a Leak guard failure on `commit author` holds #6052, main isn't broken and the queue doesn't freeze", () => {
    const first = pass(day("commit author", "failure"));
    expect(first.state.failedHeads).toEqual({ "6052": headOf(6052) });
    expect(first.state.mainBroken).toBeNull();
    expect(first.state.board.mainRed).toBeNull();
    expect(first.log.filter((line) => line.rule === "main-broken")).toEqual([]);
    expect(actionsOf(first, "comment").map((each) => each.number)).toEqual([6052]);
    expect(enqueued(first)).not.toContain(6052);
    const next = pass(snapshot({ ...day("commit author", "failure"), groupRuns: [] }), first.state);
    expect(enqueued(next)).toEqual([6053]);
    expect(next.state.failedHeads).toEqual({ "6052": headOf(6052) });
  });

  test("the commit message or the pull request title, with main's push run green, holds the PR and says nothing about main", () => {
    for (const label of ["commit message", "pull request title"]) {
      const decision = pass(day(label, "success"));
      expect(decision.state.failedHeads).toEqual({ "6052": headOf(6052) });
      expect(decision.state.mainBroken).toBeNull();
      expect(logText(decision)).not.toContain("main-broken suspected");
    }
  });

  test("a Leak guard failure on a file the PR doesn't touch is still read by the main-broken rule", () => {
    const decision = pass(day("tooling/paperclip/src/merge-control/state.ts", "failure"));
    expect(decision.state.failedHeads).toEqual({ "6052": headOf(6052) });
    expect(decision.state.mainBroken?.files).toEqual([
      "tooling/paperclip/src/merge-control/state.ts",
    ]);
  });
});
