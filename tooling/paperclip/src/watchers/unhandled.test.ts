import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import {
  entry,
  head,
  liamApproved,
  now,
  pull,
  repo,
} from "../fast-track/fast-track.test-helper.ts";
import type { OpenFacts, QueueEntry, Snapshot, SnapshotPull } from "../snapshot/shape.ts";
import {
  emptyUnhandled,
  type ProblemKind,
  type UnhandledState,
  unhandledPass,
  unhandledText,
} from "./unhandled.ts";

const newHead = "def5678abc1234900000000000000000000000000";

function at(minutes: number): Date {
  return new Date(now.getTime() + minutes * 60_000);
}

function snapshotOf(pulls: readonly SnapshotPull[], queue: readonly QueueEntry[] = []): Snapshot {
  return {
    version: 1,
    takenAt: now.toISOString(),
    closedWindowDays: 3,
    repos: [repo(pulls, queue)],
  };
}

/** A pull request without the `fast-track` label, red on its head. */
function red(number: number, open: Partial<OpenFacts> = {}, changes: Partial<SnapshotPull> = {}) {
  return pull(number, { labels: [], ciOk: "failure", ...open }, changes);
}

/** Runs passes in order over the same state; returns each pass's reports as `#n kind`. */
function passes(steps: readonly [Snapshot, Date][], waiting: ReadonlySet<string> = new Set()) {
  let state: UnhandledState = emptyUnhandled;
  return steps.map(([snapshot, when]) => {
    const pass = unhandledPass(snapshot, state, waiting, when);
    state = pass.state;
    return pass.reports.map((report) => `#${report.number} ${report.kind}`);
  });
}

function kindsAfterSixHours(snapshot: Snapshot): string[] {
  return (
    passes([
      [snapshot, at(0)],
      [snapshot, at(360)],
    ])[1] ?? []
  );
}

verifies("paperclip.merge-watchers-unhandled", () => {
  test("reports a problem once at 6 hours on the same head, and a new head starts it over", () => {
    const first = snapshotOf([red(401)]);
    const pushed = snapshotOf([red(401, {}, { head: newHead })]);
    expect(
      passes([
        [first, at(0)],
        [first, at(359)],
        [first, at(360)],
        [first, at(370)],
        [pushed, at(380)],
        [pushed, at(739)],
        [pushed, at(740)],
      ]),
    ).toEqual([[], [], ["#401 ci_red"], [], [], [], ["#401 ci_red"]]);
  });

  test("a problem fixed and back again starts its 6 hours over", () => {
    const broken = snapshotOf([red(402)]);
    const fixed = snapshotOf([red(402, { ciOk: "pending" })]);
    expect(
      passes([
        [broken, at(0)],
        [fixed, at(300)],
        [broken, at(310)],
        [broken, at(600)],
        [broken, at(670)],
      ]),
    ).toEqual([[], [], [], [], ["#402 ci_red"]]);
  });

  test("names each kind of problem", () => {
    const pulls = [
      red(403, { ciOk: "success", mergeable: "no" }),
      red(404, { ciOk: "pending", missingChecks: ["Guard notes"] }),
      red(405, { ciOk: "success", ...liamApproved }),
      red(406, { ciOk: "pending", approvals: [{ by: "Liam", head: "0000000" }] }),
      red(407, { ciOk: "success", inQueue: true, ...liamApproved }),
      red(408, { ciOk: "success", inQueue: true, ...liamApproved }),
    ];
    const queue = [
      entry(407, 1, { groupCiOk: "failure" }),
      entry(408, 2, { jobsWaiting: 3, waitingSince: now.toISOString() }),
    ];
    const expected: string[] = [
      "#403 conflict",
      "#404 missing_check",
      "#405 queue_stall",
      "#406 stale_approval",
      "#407 group_red",
      "#408 runner_wait",
    ];
    expect(kindsAfterSixHours(snapshotOf(pulls, queue))).toEqual(expected);
  });

  test("a pull request that left the merge queue twice without merging is a problem", () => {
    const queued = snapshotOf([red(409, { ciOk: "success", inQueue: true, ...liamApproved })]);
    const out = snapshotOf([red(409, { ciOk: "pending", ...liamApproved })]);
    const reports = passes([
      [queued, at(0)],
      [out, at(10)],
      [queued, at(20)],
      [out, at(30)],
      [out, at(389)],
      [out, at(390)],
    ]);
    expect(reports).toEqual([[], [], [], [], [], ["#409 dropped_twice"]]);
  });

  test("leaves drafts, blocked tasks and forks alone", () => {
    const snapshot = snapshotOf([
      red(410, { draft: true }),
      red(411),
      red(412, {}, { headRepo: "stranger/tools" }),
    ]);
    const reports = passes(
      [
        [snapshot, at(0)],
        [snapshot, at(400)],
      ],
      new Set(["HAL-411"]),
    );
    expect(reports).toEqual([[], []]);
  });

  test("keeps the clock of a repository the snapshot didn't read", () => {
    let state = unhandledPass(snapshotOf([red(413)]), emptyUnhandled, new Set(), at(0)).state;
    state = unhandledPass({ ...snapshotOf([]), repos: [] }, state, new Set(), at(100)).state;
    const back = unhandledPass(snapshotOf([red(413)]), state, new Set(), at(360));
    expect(back.reports.map((report) => report.kind)).toEqual(["ci_red"]);
  });

  test("the report lists each problem with its task, head and age", () => {
    const kind: ProblemKind = "ci_red";
    expect(
      unhandledText(
        [
          {
            repo: "acme/tools",
            number: 401,
            url: "https://example.test/401",
            head,
            kind,
            task: "HAL-401",
            since: at(-370).toISOString(),
          },
        ],
        now,
      ),
    ).toBe(
      "UNHANDLED: 1 problem open for 6 hours or more on the same head with no fix:\n- HAL-401: [acme/tools#401](https://example.test/401), head `abc1234`: `ci-ok` red on the head, for 6 h 10 min",
    );
  });
});
