import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import {
  ago,
  check,
  enqueued,
  greenChecks,
  logText,
  now,
  pass,
  pull,
  snapshot,
  stateWith,
} from "./merge-control.test-helper.ts";
import { emptyMergeState, type MergeState } from "./state.ts";

function withBoard(board: Partial<MergeState["board"]>): MergeState {
  return stateWith({ board: { ...emptyMergeState.board, ...board } });
}

verifies("paperclip.merge-control-runner-brake", () => {
  test("a wait over 5 minutes turns the brake on once, under 2 turns it off", () => {
    const on = pass(snapshot({ runnerWaitMinutes: 6.4 }));
    expect(on.log.filter((line) => line.rule === "runner-brake").map((line) => line.text)).toEqual([
      "Runner wait 6 min on merge-group jobs: please hold pushes.",
    ]);
    expect(on.state.runnerAlertOn).toBe(now.toISOString());
    expect(
      pass(snapshot({ runnerWaitMinutes: 7 }), on.state).log.some(
        (line) => line.rule === "runner-brake",
      ),
    ).toBe(false);
    const off = pass(snapshot({ runnerWaitMinutes: 1 }), on.state);
    expect(off.log.filter((line) => line.rule === "runner-brake").map((line) => line.text)).toEqual(
      ["Runner wait cleared."],
    );
    expect(off.state.runnerAlertOn).toBeNull();
  });

  test("an unreadable wait is said, never a silent 0", () => {
    expect(logText(pass(snapshot({ runnerWaitMinutes: null })))).toContain(
      "RUNNER_WAIT_UNREADABLE",
    );
  });

  test("a lower fill target comes back after 30 minutes of low wait, unless the board set it by hand", () => {
    const low = stateWith({ fillTarget: 8, lowWaitSince: ago(31) });
    const restored = pass(snapshot(), low);
    expect(restored.state.fillTarget).toBeNull();
    expect(logText(restored)).toContain("TARGET_RESTORED 15 (was 8)");
    expect(pass(snapshot(), { ...low, tuneManual: true }).state.fillTarget).toBe(8);
    expect(pass(snapshot({ runnerWaitMinutes: 3 }), low).state.lowWaitSince).toBeNull();
  });
});

verifies("paperclip.merge-control-fill-pause", () => {
  const pause = { until: ago(-60), waitFor: [2] };

  test("while paused only the pull requests it waits for are added", () => {
    const pending = pull(2, {
      checks: [
        ...greenChecks().slice(1),
        check("ci-ok", "CI", { status: "in_progress", conclusion: null }),
      ],
    });
    const decision = pass(snapshot({ pulls: [pull(1), pending] }), withBoard({ fillPause: pause }));
    expect(enqueued(decision)).toEqual([]);
    expect(logText(decision)).toContain("FILL_PAUSED until 13:00 (waiting for ci-ok on #2)");
  });

  test("it ends once each has a green ci-ok, or at its time limit", () => {
    const green = pass(snapshot({ pulls: [pull(1), pull(2)] }), withBoard({ fillPause: pause }));
    expect(enqueued(green)).toEqual([1, 2]);
    expect(green.state.board.fillPause).toBeNull();
    expect(logText(green)).toContain("FILL_PAUSE_END (ci-ok green on #2)");
    const late = pass(
      snapshot({ pulls: [pull(1)] }),
      withBoard({ fillPause: { until: ago(1), waitFor: [2] } }),
    );
    expect(logText(late)).toContain("FILL_PAUSE_END (time limit; green: none)");
  });
});

verifies("paperclip.merge-control-main-red", () => {
  const freeze = { since: ago(60), allowRe: "HAL-2\\b" };

  test("while main is red only the fix goes in, with a jump", () => {
    const decision = pass(snapshot({ pulls: [pull(1), pull(2)] }), withBoard({ mainRed: freeze }));
    expect(decision.actions).toEqual([
      {
        kind: "enqueue",
        number: 2,
        pullId: "PR_2",
        head: pull(2).head,
        jump: true,
        cost: { groupsCancelled: 0, runnerMinutes: 0 },
      },
    ]);
    expect(logText(decision)).toContain("JUMPED #2 (fix)");
  });

  test("it ends on the first green, not cancelled push run on main after it began", () => {
    const runs = [
      {
        id: 1,
        headSha: "abcdef1234",
        status: "completed",
        conclusion: "cancelled",
        createdAt: ago(5),
        branch: "main",
      },
      {
        id: 2,
        headSha: "1234abcdef",
        status: "completed",
        conclusion: "success",
        createdAt: ago(10),
        branch: "main",
      },
    ];
    const decision = pass(
      snapshot({ pulls: [pull(1)], mainRuns: runs }),
      withBoard({ mainRed: freeze }),
    );
    expect(decision.state.board.mainRed).toBeNull();
    expect(enqueued(decision)).toEqual([1]);
    expect(logText(decision)).toContain("MAIN_GREEN at 1234abcde");
  });

  test("a pattern that doesn't compile lets nothing in", () => {
    const decision = pass(
      snapshot({ pulls: [pull(1)] }),
      withBoard({ mainRed: { since: ago(60), allowRe: "(" } }),
    );
    expect(enqueued(decision)).toEqual([]);
  });
});
