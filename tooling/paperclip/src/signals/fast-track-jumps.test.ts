import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import {
  ago,
  entry,
  liamApproved,
  merged,
  now,
  pull,
  repo,
  settings,
} from "../fast-track/fast-track.test-helper.ts";
import { emptyState, type FastTrackState, fastTrackPass } from "../fast-track/pass.ts";
import type { Snapshot, SnapshotRepo } from "../snapshot/shape.ts";
import { decide } from "./rules/fast-track-jumps.ts";

/**
 * The jump inputs of `fast-track/pass.test.ts`, replayed through the
 * `fast-track` signal rule's third step (HAL-18973): for each pass, the
 * step's jump log and totals line equal today's `fastTrackPass`.
 */

function snapshotAt(at: Date, ...repos: SnapshotRepo[]): Snapshot {
  return { version: 1, takenAt: at.toISOString(), closedWindowDays: 3, repos };
}

/** Today's pass: the jump log it keeps and the totals line, if it logged one. */
function today(snapshot: Snapshot, before: FastTrackState, at: Date) {
  const pass = fastTrackPass(snapshot, before, settings, at);
  const totals = pass.lines.filter((line) => line.startsWith("fast-track jumps:"));
  return { jumps: pass.state.jumps, totals, state: pass.state };
}

/** The step's pass, every input through JSON as a ToolScript Action gets it. */
function step(snapshot: Snapshot, before: FastTrackState, at: Date) {
  const input = JSON.parse(
    JSON.stringify({
      now: at.toISOString(),
      repos: snapshot.repos,
      records: before.jumps,
      totalsDay: before.totalsDay,
    }),
  );
  const actions = decide(input);
  const totals = actions.flatMap((action) => (action.kind === "jump-totals" ? [action.line] : []));
  const jumps = actions.flatMap((action) => (action.kind === "jump-log" ? action.records : []));
  return { jumps, totals };
}

/** Checks parity for one pass and gives today's state for the next. */
function expectParity(snapshot: Snapshot, before: FastTrackState, at = now): FastTrackState {
  const expected = today(snapshot, before, at);
  expect(step(snapshot, before, at)).toEqual({ jumps: expected.jumps, totals: expected.totals });
  return expected.state;
}

const waiting = [1, 2, 3, 4].map((number) =>
  entry(300 + number, number + 1, { enqueuedAt: ago(40 - number) }),
);
const jumping = entry(204, 1, { enqueuedAt: ago(20), groupHead: null, groupCiOk: null });
const queued = pull(204, { ...liamApproved, inQueue: true });
const inQueue = repo([queued, merged(299, 30)], [jumping, ...waiting]);

verifies("paperclip.signal-fast-track", () => {
  test("gives today's jump log and totals for pass.test.ts's jump, pass by pass", () => {
    const seen = expectParity(snapshotAt(now, inQueue), emptyState);
    expect(seen.jumps).toEqual([expect.objectContaining({ number: 204, jumped: true })]);
    expect(seen.totalsDay).toBe("2026-11-23");

    const again = expectParity(snapshotAt(now, inQueue), seen);
    expect(again.jumps).toEqual(seen.jumps);

    const done = expectParity(snapshotAt(now, repo([merged(204, 0)])), again);
    expect(done.jumps[0]).toMatchObject({ enqueueToMergeMinutes: 20 });

    const nextDay = new Date(now.getTime() + 24 * 60 * 60_000);
    const totals = today(snapshotAt(nextDay), done, nextDay).totals;
    expect(totals).toEqual([
      "fast-track jumps: 1 queue entries logged, 1 merged, 1 of those jumped, about -7 min saved by the estimate.",
    ]);
    expectParity(snapshotAt(nextDay), done, nextDay);
  });

  test("gives today's log for an unlabelled entry, a repository not read, and an empty log", () => {
    const plain = repo([pull(205, { inQueue: true, labels: [] })], [entry(205, 1)]);
    const nothing = expectParity(snapshotAt(now, plain), emptyState);
    expect(nothing.jumps).toEqual([]);

    const seen = expectParity(snapshotAt(now, inQueue), emptyState);
    const unread = expectParity(snapshotAt(now), { ...seen, totalsDay: null });
    expect(unread.jumps).toEqual(seen.jumps);
  });

  test("keeps the newest 200 records, as today's pass does", () => {
    const seen = today(snapshotAt(now, inQueue), emptyState, now).state;
    const [record] = seen.jumps;
    if (record === undefined) {
      throw new Error("the jump wasn't logged");
    }
    const full = Array.from({ length: 200 }, (_, index) => ({ ...record, number: 1000 + index }));
    const before = { ...seen, jumps: full, totalsDay: null };
    const kept = expectParity(snapshotAt(now, inQueue), before);
    expect(kept.jumps).toHaveLength(200);
    expect(kept.jumps.at(-1)).toMatchObject({ number: 204 });
  });
});
