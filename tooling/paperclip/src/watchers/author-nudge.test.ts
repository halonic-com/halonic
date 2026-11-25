import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { head, liamApproved, pull, repo } from "../fast-track/fast-track.test-helper.ts";
import type { OpenFacts, SnapshotPull, SnapshotRepo } from "../snapshot/shape.ts";
import {
  type AuthorNudge,
  type AuthorNudgeState,
  authorNudgePass,
  authorNudgeText,
  emptyAuthorNudge,
  type NudgeTask,
} from "./author-nudge.ts";

const newHead = "def5678abc1234900000000000000000000000000";
const withAuthor: NudgeTask = { withAuthor: true, parked: false };
const parked: NudgeTask = { withAuthor: true, parked: true };
const withReviewer: NudgeTask = { withAuthor: false, parked: false };

/** An open pull request without the `fast-track` label. */
function open(number: number, facts: Partial<OpenFacts> = {}, changes: Partial<SnapshotPull> = {}) {
  return pull(number, { labels: [], ...facts }, changes);
}

/** Runs passes in order over the same state; returns each pass's nudges. */
function passes(
  reads: readonly SnapshotRepo[],
  tasks: Record<string, NudgeTask>,
  handQueueBranches: readonly string[] = [],
): AuthorNudge[][] {
  let state: AuthorNudgeState = emptyAuthorNudge;
  return reads.map((read) => {
    const pass = authorNudgePass(read, state, {
      tasks: new Map(Object.entries(tasks)),
      handQueueBranches,
    });
    state = pass.state;
    return [...pass.nudges];
  });
}

/** #600 merged, and #601 above it, moved to `main` since its last push. */
function stacked(facts: Partial<OpenFacts> = {}): SnapshotRepo {
  const base: SnapshotPull = {
    ...pull(600),
    branch: "mateo/HAL-600-base",
    state: "merged",
    mergedAt: "2026-11-23T11:00:00Z",
    open: null,
  };
  const child = open(601, {
    baseChangedSincePush: true,
    previousBase: "mateo/HAL-600-base",
    mergeable: "no",
    ...facts,
  });
  return repo([child, base]);
}

verifies("paperclip.merge-watchers-author-nudge", () => {
  describe("stacked PR base merged wakes author", () => {
    test("one todo wake naming the conflict, and none again on the same head", () => {
      const read = stacked();
      const [first, second] = passes([read, read], { "HAL-601": parked });
      expect(first?.map(({ kind, task, todo }) => ({ kind, task, todo }))).toEqual([
        { kind: "stack_base_merged", task: "HAL-601", todo: true },
      ]);
      expect(first?.[0]?.text).toContain("Rebase on main, then ask the reviewer to re-approve");
      expect(first?.[0]?.text).toContain("left a conflict with `main`");
      expect(first?.[0]?.text).not.toContain("range-diff");
      expect(second).toEqual([]);
    });

    test("an approved child also names the range-diff re-approval", () => {
      const [first] = passes([stacked({ ...liamApproved, mergeable: "yes" })], {
        "HAL-601": parked,
      });
      expect(first?.[0]?.text).toContain("range-diff re-approval (HAL-14809)");
      expect(first?.[0]?.text).not.toContain("conflict");
    });

    test("a pushed child gets no stack nudge, and one whose task its reviewer holds none at all", () => {
      const pushed = passes([stacked({ baseChangedSincePush: false })], { "HAL-601": parked })[0];
      const [reviewing] = passes([stacked()], { "HAL-601": withReviewer });
      // Pushed since the move: only the plain conflict nudge is left.
      expect(pushed?.map(({ kind }) => kind)).toEqual(["conflict"]);
      expect(reviewing).toEqual([]);
    });
  });

  test("review_ready wakes the author once per green head, not when the reviewer holds the task", () => {
    const first = repo([open(610)]);
    const pushed = repo([open(610, {}, { head: newHead })]);
    const nudges = passes([first, first, pushed], { "HAL-610": withAuthor });
    expect(nudges.map((list) => list.map(({ kind, head: at }) => `${kind} ${at}`))).toEqual([
      [`review_ready ${head}`],
      [],
      [`review_ready ${newHead}`],
    ]);
    expect(nudges[0]?.[0]?.text).toContain("Hand the task to the reviewer");
    expect(passes([first], { "HAL-610": withReviewer })).toEqual([[]]);
  });

  test("needs_hand_queue gives one hand-merge note per head for a branch the settings mark", () => {
    const read = repo([open(620, liamApproved, { branch: "board/HAL-620-thing" })]);
    const tasks = { "HAL-620": withAuthor };
    const nudges = passes([read, read], tasks, ["board/"]);
    expect(nudges.map((list) => list.map(({ kind, todo }) => `${kind} ${todo}`))).toEqual([
      ["needs_hand_queue false"],
      [],
    ]);
    expect(nudges[0]?.[0]?.text).toContain("Merge it by hand");
    expect(passes([read], tasks)).toEqual([[]]);
  });

  test("a conflict outside the queue on a blocked task wakes it as todo once per head, never while queued", () => {
    const conflicting = repo([open(630, { mergeable: "no" })]);
    const queued = repo([open(630, { mergeable: "no", inQueue: true })]);
    const pushed = repo([open(630, { mergeable: "no" }, { head: newHead })]);
    const nudges = passes([queued, conflicting, conflicting, pushed], { "HAL-630": parked });
    expect(nudges.map((list) => list.map(({ kind, todo }) => `${kind} ${todo}`))).toEqual([
      [],
      ["conflict true"],
      [],
      ["conflict true"],
    ]);
    expect(nudges[1]?.[0]?.text).toContain("Rebase on main");
  });

  test("a fork, a closed task and an unread repository are left alone", () => {
    const fork = repo([open(640, { mergeable: "no" }, { headRepo: "someone/tools" })]);
    expect(passes([fork], { "HAL-640": parked })).toEqual([[]]);
    expect(passes([repo([open(641, { mergeable: "no" })])], {})).toEqual([[]]);
    const kept: AuthorNudgeState = { version: 1, nudged: { "conflict acme/tools#1": head } };
    expect(authorNudgePass(undefined, kept, { tasks: new Map(), handQueueBranches: [] })).toEqual({
      nudges: [],
      state: kept,
    });
  });

  test("the comment has a line and a marker per nudge", () => {
    const [nudges] = passes([repo([open(610)])], { "HAL-610": withAuthor });
    const text = authorNudgeText(nudges ?? []);
    expect(text).toContain("- [#610](https://github.com/acme/tools/pull/610): it is out of draft");
    expect(text).toContain("<!-- merge-watchers: review_ready #610 abc1234 -->");
  });
});
