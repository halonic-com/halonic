import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import {
  actionsOf,
  ago,
  boardLogin,
  check,
  entry,
  greenChecks,
  headOf,
  logText,
  pass,
  pull,
  said,
  snapshot,
  stateWith,
} from "./merge-control.test-helper.ts";
import type { CiOkRun, RunFact } from "./snapshot.ts";

const cancelledOk = [...greenChecks().slice(1), check("ci-ok", "CI", { conclusion: "cancelled" })];
const redOk = [...greenChecks().slice(1), check("ci-ok", "CI", { conclusion: "failure" })];

function cancelled(number: number, changes: Parameters<typeof pull>[1] = {}) {
  return pull(number, { checks: cancelledOk, texts: [said("no review yet")], ...changes });
}

function reruns(decision: ReturnType<typeof pass>) {
  return actionsOf(decision, "rerun").map((each) => each.runId);
}

verifies("paperclip.merge-control-cancelled-reruns", () => {
  test("a cancelled ci-ok is rerun without an approval, Liam-approved ones first, up to 8 a pass", () => {
    const unapproved = Array.from({ length: 9 }, (_, index) => cancelled(index + 1));
    const approved = pull(20, { checks: cancelledOk });
    const decision = pass(snapshot({ pulls: [...unapproved, approved] }));
    expect(reruns(decision)).toEqual([9020, 9001, 9002, 9003, 9004, 9005, 9006, 9007]);
  });

  test("each head at most once an hour; a red ci-ok, a running or missing run is not rerun", () => {
    const state = stateWith({ reran: { "1": { head: headOf(1), at: ago(30), run: 9001 } } });
    expect(reruns(pass(snapshot({ pulls: [cancelled(1)] }), state))).toEqual([]);
    expect(
      reruns(
        pass(
          snapshot({ pulls: [cancelled(1)] }),
          stateWith({ reran: { "1": { head: headOf(1), at: ago(70), run: 1 } } }),
        ),
      ),
    ).toEqual([9001]);
    expect(reruns(pass(snapshot({ pulls: [pull(1, { checks: redOk })] })))).toEqual([]);
    const running = cancelled(2, { ciRun: { id: 9002, status: "in_progress", createdAt: ago(1) } });
    const none = cancelled(3, { ciRun: null });
    const decision = pass(snapshot({ pulls: [running, none] }));
    expect(reruns(decision)).toEqual([]);
    expect(logText(decision)).toContain("skipped #3: no CI run on head (needs a push)");
  });

  test("reruns pause while a merge-group job waits more than a minute, or the wait can't be read", () => {
    expect(reruns(pass(snapshot({ pulls: [cancelled(1)], runnerWaitMinutes: 1.5 })))).toEqual([]);
    const unread = pass(snapshot({ pulls: [cancelled(1)], runnerWaitMinutes: null }));
    expect(reruns(unread)).toEqual([]);
    expect(logText(unread)).toContain("paused: could not read merge-group jobs");
  });
});

verifies("paperclip.merge-control-flake-reruns", () => {
  function flaky(run: Partial<CiOkRun>, changes: Parameters<typeof pull>[1] = {}) {
    return pull(1, {
      labels: ["built-on:paperclip", "fast-track"],
      fastTrackBy: boardLogin,
      checks: redOk,
      ciOkRun: {
        runId: 555,
        headSha: headOf(1),
        ciOkJobId: 1,
        ciOkLog: "",
        failedJobs: [{ id: 1, name: "ci-ok", url: "", failedSteps: ["Check"] }],
        ...run,
      },
      ...changes,
    });
  }
  const failedJobs = (steps: string[]) => [
    { id: 1, name: "ci-ok", url: "", failedSteps: ["Check"] },
    { id: 2, name: "Test", url: "", failedSteps: steps },
  ];

  test("an approved fast-track pull request whose merge base's tests were cancelled has its failed jobs rerun once per head", () => {
    const facts = snapshot({
      pulls: [flaky({ ciOkLog: "The merge base's tests job ended as cancelled" })],
    });
    const first = pass(facts);
    expect(actionsOf(first, "rerun-failed-jobs").map((each) => each.runId)).toEqual([555]);
    expect(actionsOf(pass(facts, first.state), "rerun-failed-jobs")).toEqual([]);
  });

  test("failed jobs that died only in setup steps count; a real test failure doesn't", () => {
    const setup = pass(snapshot({ pulls: [flaky({ failedJobs: failedJobs(["Set up job"]) })] }));
    expect(actionsOf(setup, "rerun-failed-jobs")).toHaveLength(1);
    const real = pass(snapshot({ pulls: [flaky({ failedJobs: failedJobs(["Run tests"]) })] }));
    expect(actionsOf(real, "rerun-failed-jobs")).toEqual([]);
    expect(logText(real)).toContain("skipped #1: ci-ok red, not a known flake");
  });

  test("unapproved, unlabelled or a run from another head is left to the author", () => {
    const log = { ciOkLog: "Rerun the failed jobs" };
    expect(
      actionsOf(pass(snapshot({ pulls: [flaky(log, { texts: [] })] })), "rerun-failed-jobs"),
    ).toEqual([]);
    expect(
      actionsOf(
        pass(snapshot({ pulls: [flaky(log, { fastTrackBy: "someone" })] })),
        "rerun-failed-jobs",
      ),
    ).toEqual([]);
    expect(
      actionsOf(
        pass(snapshot({ pulls: [flaky({ ...log, headSha: "f".repeat(40) })] })),
        "rerun-failed-jobs",
      ),
    ).toEqual([]);
  });
});

function run(id: number, changes: Partial<RunFact> = {}): RunFact {
  return {
    id,
    headSha: "group-1",
    status: "completed",
    conclusion: "failure",
    createdAt: ago(40),
    branch: "x",
    ...changes,
  };
}

verifies("paperclip.merge-control-stall", () => {
  test("a front entry waiting over 30 minutes with every group run finished has its failed runs rerun", () => {
    const queue = [entry(1, 1, { enqueuedAt: ago(45) })];
    const runs = [run(1), run(2, { conclusion: "success" })];
    const decision = pass(snapshot({ pulls: [pull(1)], queue, mergeGroupRuns: runs }));
    expect(reruns(decision)).toEqual([1]);
    expect(logText(decision)).toContain("stalled #1");
  });

  test("a run still going, a young entry or one further back is left alone", () => {
    const old = { enqueuedAt: ago(45) };
    expect(
      reruns(
        pass(
          snapshot({
            queue: [entry(1, 1, old)],
            mergeGroupRuns: [run(1), run(2, { status: "in_progress" })],
          }),
        ),
      ),
    ).toEqual([]);
    expect(reruns(pass(snapshot({ queue: [entry(1, 1)], mergeGroupRuns: [run(1)] })))).toEqual([]);
    expect(reruns(pass(snapshot({ queue: [entry(1, 4, old)], mergeGroupRuns: [run(1)] })))).toEqual(
      [],
    );
  });
});

verifies("paperclip.merge-control-stale-runs", () => {
  test("queued group runs of groups no longer queued, and queued runs on an old head, are cancelled", () => {
    const facts = snapshot({
      pulls: [pull(1)],
      queue: [entry(1, 1)],
      mergeGroupRuns: [
        run(10, { status: "queued", headSha: "group-1", createdAt: ago(5) }),
        run(11, { status: "queued", headSha: "gone", createdAt: ago(5) }),
        run(12, { status: "queued", headSha: "gone", createdAt: ago(25 * 60) }),
      ],
      queuedPullRuns: [
        run(20, { status: "queued", headSha: headOf(1), branch: "mateo/HAL-1-thing" }),
        run(21, { status: "queued", headSha: "old", branch: "mateo/HAL-1-thing" }),
        run(22, { status: "queued", headSha: "old", branch: "closed/branch" }),
      ],
    });
    expect(actionsOf(pass(facts), "cancel-run").map((each) => each.runId)).toEqual([11, 21]);
  });

  test("a group run GitHub queued under 3 minutes ago is left alone, even if the queue read doesn't show its group yet", () => {
    // Run 45600263634, 25 Nov 11:00: #6053's group rebuilt without #6052; it went green and merged.
    const facts = snapshot({
      queue: [entry(6053, 1, { groupHead: "group-with-6052" })],
      mergeGroupRuns: [
        run(45600263634, { status: "queued", headSha: "group-without-6052", createdAt: ago(1) }),
      ],
    });
    expect(actionsOf(pass(facts), "cancel-run")).toEqual([]);
  });
});
