import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import {
  actionsOf,
  ago,
  entry,
  headOf,
  pass,
  pull,
  snapshot,
  stateWith,
} from "./merge-control.test-helper.ts";
import { emptyMergeState } from "./state.ts";

function waitingSince(minutes: number, head = headOf(1)) {
  return stateWith({ notQueuedSince: { "1": { head, at: ago(minutes) } } });
}

function notQueued(decision: ReturnType<typeof pass>) {
  return actionsOf(decision, "comment").filter((each) => each.key.startsWith("not-queued#"));
}

verifies("paperclip.merge-control-not-queued-reason", () => {
  const conflicting = pull(1, { mergeable: "CONFLICTING", mergeStateStatus: "DIRTY" });

  test("an approved, green pull request that conflicts with main is told so once, after 30 minutes", () => {
    const first = pass(snapshot({ pulls: [conflicting] }));
    expect(notQueued(first)).toEqual([]);
    expect(first.state.notQueuedSince).toEqual({ "1": { head: headOf(1), at: ago(0) } });

    expect(notQueued(pass(snapshot({ pulls: [conflicting] }), waitingSince(29)))).toEqual([]);

    const late = pass(snapshot({ pulls: [conflicting] }), waitingSince(31));
    expect(notQueued(late)).toEqual([
      {
        kind: "comment",
        number: 1,
        key: `not-queued#1@${headOf(1)}`,
        body: expect.stringContaining(
          "has waited out of the merge queue for 31 minutes. Why:\n- conflicts with main: please rebase\n",
        ),
      },
    ]);

    expect(notQueued(pass(snapshot({ pulls: [conflicting] }), late.state))).toEqual([]);
  });

  test("a new head starts the 30 minutes again and gets its own note", () => {
    const late = pass(snapshot({ pulls: [conflicting] }), waitingSince(31));
    const pushed = pull(1, {
      head: headOf(1, 1),
      mergeable: "CONFLICTING",
      mergeStateStatus: "DIRTY",
    });
    const fresh = pass(snapshot({ pulls: [pushed] }), late.state);
    expect(notQueued(fresh)).toEqual([]);
    expect(fresh.state.notQueuedSince["1"]).toEqual({ head: headOf(1, 1), at: ago(0) });

    const again = pass(snapshot({ pulls: [pushed] }), {
      ...late.state,
      notQueuedSince: { "1": { head: headOf(1, 1), at: ago(30) } },
    });
    expect(notQueued(again).map((each) => each.key)).toEqual([`not-queued#1@${headOf(1, 1)}`]);
  });

  test("the fill's reasons are told: a hotspot names the queued pull request, a board hold its reason", () => {
    const queued = pull(2, { files: ["pnpm-lock.yaml"], fileNet: { "pnpm-lock.yaml": 5 } });
    const sharing = pull(1, { files: ["pnpm-lock.yaml"], fileNet: { "pnpm-lock.yaml": 5 } });
    const hotspot = pass(
      snapshot({ pulls: [sharing, queued], queue: [entry(2, 1)] }),
      waitingSince(45),
    );
    expect(notQueued(hotspot)[0]?.body).toContain(
      "- overlaps queued #2 in `pnpm-lock.yaml` (hotspot)",
    );

    const held = pass(snapshot({ pulls: [pull(1)] }), {
      ...waitingSince(45),
      board: { ...emptyMergeState.board, hold: { "1": "release freeze" } },
    });
    expect(notQueued(held)[0]?.body).toContain("- held out by the board: release freeze");
  });

  test("a reason another note already gave on this head isn't told again", () => {
    const blocked = pull(1, { mergeStateStatus: "BLOCKED" });
    const decision = pass(snapshot({ pulls: [blocked] }), waitingSince(45));
    expect(actionsOf(decision, "comment").map((each) => each.key)).toEqual([
      `blocked#1@${headOf(1)}`,
    ]);
  });

  test("a queued, unapproved or red pull request has no wait", () => {
    const queued = pass(snapshot({ pulls: [pull(1)], queue: [entry(1, 1)] }), waitingSince(45));
    const unapproved = pass(snapshot({ pulls: [pull(1, { texts: [] })] }), waitingSince(45));
    const added = pass(snapshot({ pulls: [pull(1)] }), waitingSince(45));
    for (const decision of [queued, unapproved, added]) {
      expect(notQueued(decision)).toEqual([]);
      expect(decision.state.notQueuedSince).toEqual({});
    }
  });
});
