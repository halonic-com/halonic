import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { importMergerDay } from "./import-merger.ts";
import { reportTable } from "./report.ts";
import { jumpOver8, simulate } from "./simulate.ts";

const log = [
  "2026-11-23T23:58:00.000Z | merged=- | queued=0 | added=#90 | waiting=-",
  "2026-11-24T08:00:00.000Z | merged=- | queued=2 | dequeued=- | added=#1,#2(approval=julian) | waiting=- | failedGroups=-",
  "2026-11-24T08:06:00.000Z | merged=#1 | queued=2 | dequeued=- | added=#3 | waiting=- | failedGroups=-",
  "2026-11-24T08:12:00Z | manual: hold on #2 lifted",
  "2026-11-24T08:20:00.000Z | merged=- | queued=1 | dequeued=#3(conflicts with main: please rebase) | added=- | failedGroups=CI@pr-2-ab12 https://github.com/acme/tools/actions/runs/7 culprit #2 (out of queue, held until a new head)",
  "2026-11-24T09:50:00.000Z | merged=- | queued=1 | dequeued=- | added=#2 | failedGroups=-",
  "2026-11-24T10:05:00.000Z | merged=#2,#3 | queued=0 | dequeued=- | added=- | failedGroups=-",
].join("\n");

const snapshots = [
  {
    t: "2026-11-24T08:01:00Z",
    q: [
      { pr: 1, pos: 1, state: "AWAITING_CHECKS", enq: "2026-11-24T08:00:00Z", ft: false },
      { pr: 2, pos: 2, state: "AWAITING_CHECKS", enq: "2026-11-24T08:00:01Z", ft: true },
    ],
  },
  {
    t: "2026-11-24T08:07:00Z",
    q: [{ pr: 3, pos: 1, state: "QUEUED", enq: "2026-11-24T08:06:00Z", ft: false }],
  },
]
  .map((line) => JSON.stringify(line))
  .join("\n");

const jumps = JSON.stringify({
  entries: {
    "2@2026-11-24T08:00:01Z": {
      pr: 2,
      enqueuedAt: "2026-11-24T08:00:01Z",
      jumped: true,
      cancelledGroups: [{}, {}],
    },
    "9@2026-11-23T10:00:00Z": {
      pr: 9,
      enqueuedAt: "2026-11-23T10:00:00Z",
      jumped: true,
      cancelledGroups: [{}],
    },
  },
});

const gateReport = JSON.stringify({ rows: [{ number: 3, files: ["pnpm-lock.yaml"] }] });

verifies("paperclip.merge-control-sim", () => {
  test("the Merger's files give the day's pull requests, timings and what was recorded", () => {
    const day = importMergerDay("2026-11-24", { snapshots, log, jumps, gateReport });
    expect(day.pulls).toEqual([
      {
        number: 1,
        readyAt: "2026-11-24T08:00:00.000Z",
        fastTrack: false,
        failsOnce: false,
        conflictsAt: null,
        files: [],
      },
      {
        number: 2,
        readyAt: "2026-11-24T08:00:00.000Z",
        fastTrack: true,
        failsOnce: true,
        conflictsAt: null,
        files: [],
      },
      {
        number: 3,
        readyAt: "2026-11-24T08:06:00.000Z",
        fastTrack: false,
        failsOnce: false,
        conflictsAt: "2026-11-24T08:20:00.000Z",
        files: ["pnpm-lock.yaml"],
      },
    ]);
    expect(day.timings).toEqual({
      groupBuildMinutes: 6,
      refixMinutes: 90,
      buildLimit: 2,
      runnerGroups: null,
    });
    expect(day.recorded).toEqual({
      merged: 3,
      jumps: 1,
      groupsCancelledByJumps: 2,
      timeToMerge: { count: 3, median: 119, p90: 125 },
    });
  });

  test("the report names each rule set and what the day recorded", () => {
    const day = importMergerDay("2026-11-24", { snapshots, log, jumps: "", gateReport: "" });
    const table = reportTable(day, [simulate(day, jumpOver8)]);
    expect(table).toContain(
      "Day 2026-11-24: 3 pull requests (1 fast-track, 1 failed a group, 1 conflicted in the queue).",
    );
    expect(table).toContain("| recorded (the Merger) | 3 |");
    expect(table).toMatch(/\| jump >8 \(today\) \| 3 \|/);
  });
});
