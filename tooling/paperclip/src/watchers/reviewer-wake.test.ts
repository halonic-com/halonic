import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { head, liamApproved, now, pull, repo } from "../fast-track/fast-track.test-helper.ts";
import type { OpenFacts, Snapshot, SnapshotPull } from "../snapshot/shape.ts";
import {
  emptyReviewerWake,
  type ReviewerWakeState,
  reviewerWakePass,
  reviewerWakeText,
} from "./reviewer-wake.ts";

const watched = "acme/tools";
const newHead = "def5678abc1234900000000000000000000000000";

function at(minutes: number): Date {
  return new Date(now.getTime() + minutes * 60_000);
}

function snapshotOf(...pulls: SnapshotPull[]): Snapshot {
  return { version: 1, takenAt: now.toISOString(), closedWindowDays: 3, repos: [repo(pulls)] };
}

/** A green, mergeable pull request without the `fast-track` label, waiting for its review. */
function waiting(
  number: number,
  open: Partial<OpenFacts> = {},
  changes: Partial<SnapshotPull> = {},
) {
  return pull(number, { labels: [], ...open }, changes);
}

/** Runs passes in order over the same state; returns each pass's wakes. */
function passes(steps: readonly [Snapshot, Date][]) {
  let state: ReviewerWakeState = emptyReviewerWake;
  return steps.map(([snapshot, when]) => {
    const pass = reviewerWakePass(snapshot, watched, state, when);
    state = pass.state;
    return pass.wakes;
  });
}

verifies("paperclip.merge-watchers-reviewer-wake", () => {
  test("wakes the reviewer once per head after 60 minutes, and again for a new head", () => {
    const first = snapshotOf(waiting(301));
    const pushed = snapshotOf(waiting(301, {}, { head: newHead }));
    const wakes = passes([
      [first, at(0)],
      [first, at(59)],
      [first, at(60)],
      [first, at(70)],
      [pushed, at(80)],
      [pushed, at(140)],
      [pushed, at(150)],
    ]);
    expect(wakes.map((list) => list.length)).toEqual([0, 0, 1, 0, 0, 1, 0]);
    expect(wakes[2]).toEqual([
      {
        reviewer: "Liam",
        pulls: [
          {
            repo: watched,
            number: 301,
            url: `https://github.com/${watched}/pull/301`,
            head,
            minutes: 60,
          },
        ],
      },
    ]);
    expect(wakes[5]?.[0]?.pulls[0]?.head).toBe(newHead);
  });

  test("a pull request Liam wrote wakes Julian, and several in one pass go into one wake", () => {
    const snapshot = snapshotOf(
      waiting(302, {}, { branch: "liam/HAL-302-thing" }),
      waiting(303),
      waiting(304),
    );
    const [, due] = passes([
      [snapshot, at(0)],
      [snapshot, at(61)],
    ]);
    expect(due?.map((wake) => [wake.reviewer, wake.pulls.map((listed) => listed.number)])).toEqual([
      ["Julian", [302]],
      ["Liam", [303, 304]],
    ]);
  });

  test("wakes the reviewer the snapshot names: Nora for a routine pull request", () => {
    const snapshot = snapshotOf(waiting(306, { reviewer: "Nora" }), waiting(307));
    const [, due] = passes([
      [snapshot, at(0)],
      [snapshot, at(61)],
    ]);
    expect(due?.map((wake) => [wake.reviewer, wake.pulls.map((listed) => listed.number)])).toEqual([
      ["Nora", [306]],
      ["Liam", [307]],
    ]);
  });

  test("a fast-track pull request wakes after 30 minutes", () => {
    const snapshot = snapshotOf(pull(305));
    const wakes = passes([
      [snapshot, at(0)],
      [snapshot, at(29)],
      [snapshot, at(30)],
    ]);
    expect(wakes.map((list) => list.length)).toEqual([0, 0, 1]);
  });

  test("doesn't wake for a pull request that waits on anything but its review", () => {
    const snapshot = snapshotOf(
      waiting(306, { draft: true }),
      waiting(307, { ciOk: "failure" }),
      waiting(308, { ciOk: "pending" }),
      waiting(309, { mergeable: "no" }),
      waiting(310, { inQueue: true }),
      waiting(311, liamApproved),
      waiting(312, {}, { headRepo: "stranger/tools" }),
    );
    const wakes = passes([
      [snapshot, at(0)],
      [snapshot, at(120)],
    ]);
    expect(wakes).toEqual([[], []]);
  });

  test("a pull request that stops waiting and waits again on the same head starts its 60 minutes over, once", () => {
    const green = snapshotOf(waiting(313));
    const red = snapshotOf(waiting(313, { ciOk: "failure" }));
    const wakes = passes([
      [green, at(0)],
      [red, at(30)],
      [green, at(40)],
      [green, at(90)],
      [green, at(100)],
      [red, at(110)],
      [green, at(120)],
      [green, at(200)],
    ]);
    expect(wakes.map((list) => list.length)).toEqual([0, 0, 0, 0, 1, 0, 0, 0]);
  });

  test("the comment lists each pull request with its head and wait", () => {
    expect(
      reviewerWakeText({
        reviewer: "Liam",
        pulls: [{ repo: watched, number: 301, url: "https://example.test/301", head, minutes: 75 }],
      }),
    ).toBe(
      "Reviewer wake: 1 pull request waits only for your review (out of draft, `ci-ok` green, mergeable, not queued, no signed approval on the head), oldest first:\n- [#301](https://example.test/301), head `abc1234`, waiting 75 min",
    );
  });
});
