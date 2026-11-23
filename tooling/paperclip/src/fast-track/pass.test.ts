import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { Snapshot, SnapshotRepo } from "../snapshot/shape.ts";
import { ago, entry, liamApproved, merged, now, pull, repo } from "./fast-track.test-helper.ts";
import { jumpTotals, updateJumps, waitWithoutJump } from "./jumps.ts";
import { emptyState, fastTrackPass, loadFastTrack, saveFastTrack } from "./pass.ts";

function snapshotOf(...repos: SnapshotRepo[]): Snapshot {
  return { version: 1, takenAt: now.toISOString(), closedWindowDays: 3, repos };
}

verifies("paperclip.fast-track-rules", () => {
  test("logs each event once, one line per task with all its reasons", () => {
    const snapshot = snapshotOf(
      repo([
        pull(201, {
          ...liamApproved,
          labels: [{ name: "fast-track", addedBy: null, addedAt: ago(60) }],
        }),
      ]),
    );
    const first = fastTrackPass(snapshot, emptyState, new Set(), now);
    expect(first.events.map((event) => event.stage)).toEqual(["new", "wrong_label"]);
    expect(first.lines).toEqual([
      expect.stringMatching(
        /^Fast-track \(dry run\) HAL-201: #201 new \(to the board supervisor\): .* \| #201 wrong_label \(to the board supervisor, the Merger\): /,
      ),
    ]);
    const second = fastTrackPass(snapshot, first.state, new Set(), now);
    expect(second.events).toEqual([]);
    expect(second.lines).toEqual([]);
  });

  test("forgets a pull request once it loses the label", () => {
    const labelled = snapshotOf(repo([pull(202, liamApproved)]));
    const state = fastTrackPass(labelled, emptyState, new Set(), now).state;
    expect(Object.keys(state.fired)).toEqual(["acme/tools#202 new"]);
    const gone = fastTrackPass(
      snapshotOf(repo([pull(202, { ...liamApproved, labels: [] })])),
      state,
      new Set(),
      now,
    );
    expect(gone.state.tracked).toEqual({});
    expect(gone.state.fired).toEqual({});
  });

  test("keeps what it tracked in a repository the snapshot didn't read", () => {
    const labelled = snapshotOf(repo([pull(205, liamApproved)]));
    const state = fastTrackPass(labelled, emptyState, new Set(), now).state;
    const missing = fastTrackPass(snapshotOf(), state, new Set(), now);
    expect(missing.state.tracked).toEqual(state.tracked);
    expect(missing.state.fired).toEqual(state.fired);
    expect(fastTrackPass(labelled, missing.state, new Set(), now).events).toEqual([]);
  });

  test("keeps its state per company in plugin state, and starts over on another version", async () => {
    const store = new Map<string, unknown>();
    const ctx = {
      state: {
        get: async (key: { scopeId?: string }) => store.get(key.scopeId ?? "") ?? null,
        set: async (key: { scopeId?: string }, value: unknown) => {
          store.set(key.scopeId ?? "", value);
        },
      },
    };
    const state = fastTrackPass(snapshotOf(repo([pull(203)])), emptyState, new Set(), now).state;
    await saveFastTrack(ctx, "acme", state);
    expect(await loadFastTrack(ctx, "acme")).toEqual(state);
    expect(await loadFastTrack(ctx, "other")).toEqual(emptyState);
    store.set("acme", { ...state, version: 2 });
    expect(await loadFastTrack(ctx, "acme")).toEqual(emptyState);
  });

  test("logs a jump's wait from the queue to the merge, and the totals once a day", () => {
    const queue = [1, 2, 3, 4].map((number) =>
      entry(300 + number, number + 1, { enqueuedAt: ago(40 - number) }),
    );
    const jumping = entry(204, 1, { enqueuedAt: ago(20), groupHead: null, groupCiOk: null });
    const inQueue = repo(
      [pull(204, { ...liamApproved, inQueue: true }), merged(299, 30)],
      [jumping, ...queue],
    );
    const [record] = updateJumps(inQueue, now, []);
    expect(record).toMatchObject({
      number: 204,
      firstPosition: 1,
      ahead: 4,
      jumped: true,
      mergesLastHour: 1,
      groupsBuilding: 4,
    });
    expect(record?.estimatedWaitMinutes).toBe(waitWithoutJump(4, 4, 1));
    const afterMerge = updateJumps(
      repo([merged(204, 0)]),
      now,
      record === undefined ? [] : [record],
    );
    expect(afterMerge[0]).toMatchObject({ mergedAt: now.toISOString(), enqueueToMergeMinutes: 20 });
    expect(jumpTotals(afterMerge)).toBe(
      "fast-track jumps: 1 queue entries logged, 1 merged, 1 of those jumped, about -7 min saved by the estimate.",
    );
    const day = fastTrackPass(snapshotOf(inQueue), emptyState, new Set(), now);
    expect(day.lines.at(-1)).toMatch(/^fast-track jumps: 1 queue entries logged/);
    expect(fastTrackPass(snapshotOf(inQueue), day.state, new Set(), now).lines).toEqual([]);
  });
});
