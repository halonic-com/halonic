import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import {
  actionsOf,
  ago,
  check,
  enqueued,
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
import { emptyMergeState } from "./state.ts";

const approvedOld = said(`Liam: approved on head \`${headOf(2).slice(0, 7)}\``);

function removed(...args: Parameters<typeof pass>) {
  return actionsOf(pass(...args), "dequeue").map((each) => [each.number, each.reason]);
}

verifies("paperclip.merge-control-removal", () => {
  test("a queued pull request isn't removed for a pending ci-ok or a missing workflow", () => {
    const pending = check("ci-ok", "CI", { status: "in_progress", conclusion: null });
    const facts = snapshot({
      pulls: [pull(1, { checks: [pending], retargetedAt: [ago(5)] })],
      queue: [entry(1, 1)],
    });
    expect(removed(facts)).toEqual([]);
  });

  test("it comes out for a conflict with main, a moved head, no signed approval, a foreign branch or a board hold", () => {
    const moved = pull(2, { head: headOf(2, 1), texts: [approvedOld] });
    const unsigned = pull(3, { texts: [said("Review of it: fine")] });
    const facts = snapshot({
      pulls: [
        pull(1, { mergeable: "CONFLICTING" }),
        moved,
        unsigned,
        pull(4, { crossRepository: true }),
        pull(5),
      ],
      queue: [1, 2, 3, 4, 5].map((number) => entry(number, number)),
    });
    const state = stateWith({
      board: { ...emptyMergeState.board, hold: { "5": "waits for #4453" } },
    });
    expect(removed(facts, state)).toEqual([
      [1, "conflict"],
      [2, "head-moved"],
      [3, "no-signed-approval"],
      [4, "foreign"],
      [5, "board-hold"],
    ]);
  });

  test("the removal comments copy the Merger's texts", () => {
    const facts = snapshot({
      pulls: [
        pull(1, { mergeable: "CONFLICTING" }),
        pull(2, { head: headOf(2, 1), texts: [approvedOld] }),
      ],
      queue: [entry(1, 1), entry(2, 2)],
    });
    const comments = actionsOf(pass(facts), "dequeue").map((each) => each.comment);
    expect(comments[0]).toContain(
      "Gate check on head `00010aaaa`:\n- conflicts with main: please rebase",
    );
    expect(comments[1]).toBe(
      "Removed from the merge queue: waiting for re-review of 00021aaaa (Liam approved 00020aa, a different head). The queue manager re-adds it once Liam approves this head.",
    );
  });

  test("unmergeable in the queue comes out only after 15 minutes, then cools down", () => {
    const facts = snapshot({
      pulls: [pull(1), pull(2)],
      queue: [entry(1, 1), entry(2, 2, { state: "UNMERGEABLE" })],
    });
    const first = pass(facts);
    expect(actionsOf(first, "dequeue")).toEqual([]);
    const later = stateWith({ ...first.state, unmergeableSince: { "2": ago(16) } });
    const second = pass(facts, later);
    expect(actionsOf(second, "dequeue").map((each) => each.reason)).toEqual(["unmergeable"]);
    expect(second.state.cooldown["2"]).toEqual({ head: headOf(2), ahead: [1], at: ago(0) });
  });

  test("an entry that is no longer unmergeable forgets its start", () => {
    const state = stateWith({ unmergeableSince: { "1": ago(5), "9": ago(5) } });
    const decision = pass(snapshot({ pulls: [pull(1)], queue: [entry(1, 1)] }), state);
    expect(decision.state.unmergeableSince).toEqual({});
  });
});

verifies("paperclip.merge-control-cooldown", () => {
  const cooled = stateWith({ cooldown: { "2": { head: headOf(2), ahead: [1], at: ago(20) } } });

  test("after an unmergeable removal it waits while a pull request that was ahead is still queued", () => {
    const decision = pass(snapshot({ pulls: [pull(1), pull(2)], queue: [entry(1, 1)] }), cooled);
    expect(enqueued(decision)).toEqual([]);
    expect(logText(decision)).toContain("#2(removed as unmergeable at");
  });

  test("a new head, or the queue ahead clearing, lifts it", () => {
    expect(enqueued(pass(snapshot({ pulls: [pull(2)] }), cooled))).toEqual([2]);
    const pushed = pull(2, {
      head: headOf(2, 1),
      texts: [said(`Liam: approved on head ${headOf(2, 1).slice(0, 7)}`)],
      checks: greenChecks(),
    });
    const decision = pass(snapshot({ pulls: [pull(1), pushed], queue: [entry(1, 1)] }), cooled);
    expect(enqueued(decision)).toEqual([2]);
    expect(decision.state.cooldown).toEqual({});
  });
});
