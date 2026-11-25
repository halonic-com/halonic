import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import {
  actionsOf,
  headOf,
  pass,
  pull,
  said,
  snapshot,
  stateWith,
} from "./merge-control.test-helper.ts";
import { emptyMergeState } from "./state.ts";
import { texts } from "./texts.ts";

verifies("paperclip.merge-control-comments", () => {
  test("a clean, green pull request waiting only for an approval is told so once per head", () => {
    const waiting = pull(1, { texts: [said("Mateo: ready for review")] });
    const first = pass(snapshot({ pulls: [waiting] }));
    expect(actionsOf(first, "comment").map((each) => each.body)).toEqual([
      `Queue manager: this PR is clean and green but not queued: no approval from Liam found for head ${headOf(1).slice(0, 9)}. It goes in on the next pass after Liam's approval names head \`${headOf(1).slice(0, 9)}\`.`,
    ]);
    expect(actionsOf(pass(snapshot({ pulls: [waiting] }), first.state), "comment")).toEqual([]);
    const pushed = pull(1, { head: headOf(1, 1), texts: [] });
    expect(actionsOf(pass(snapshot({ pulls: [pushed] }), first.state), "comment")).toHaveLength(1);
  });

  test("an approved, green pull request GitHub shows as blocked is told why once", () => {
    const blocked = pull(1, { mergeStateStatus: "BLOCKED" });
    const state = stateWith({
      board: { ...emptyMergeState.board, hold: { "1": "the board's call" } },
    });
    const decision = pass(snapshot({ pulls: [blocked] }), state);
    expect(actionsOf(decision, "comment").map((each) => each.key)).toEqual([
      `blocked#1@${headOf(1)}`,
    ]);
  });

  test("no comment text names anyone with an @", () => {
    const hold = { file: "a.ts", main: 1, net: 1, ahead: [{ n: 2, net: 1 }], total: 3 };
    const all = [
      texts.removedForeign,
      texts.notQueuedForeign,
      texts.removedHold("x"),
      texts.removedReReview("x"),
      texts.removedGate("abc", ["x"]),
      texts.unmergeableSince("2026-11-24T12:00:00Z"),
      texts.culprit(["Lint"], "u"),
      texts.culprit([], "u"),
      texts.liveCloud,
      texts.carried("a", "b"),
      texts.fileSize(hold, 500),
      texts.waitingApproval("x", "abc"),
      texts.blocked("abc"),
      texts.notQueued("abc", 31, ["x"]),
      texts.brakeOn(6),
      texts.brakeOff,
    ];
    for (const text of all) {
      expect(text).not.toMatch(/@\w/);
    }
  });
});
