import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { amsterdamTime } from "../amsterdam-time.ts";
import { at, pull, snapshot } from "./merge-speed.test-helper.ts";
import { mergeSpeed, planTrend, readMergeSpeedRecord, trackQueue } from "./merge-speed.ts";

verifies("paperclip.board-check-merge-speed", () => {
  test("turns a pull request gone from the queue into a merged or dropped exit", () => {
    const first = trackQueue(
      undefined,
      snapshot(
        at("10:00"),
        [
          [11, at("09:30")],
          [12, at("09:40")],
        ],
        [],
      ),
    );
    const second = trackQueue(first, snapshot(at("10:10"), [], [pull(11, at("10:05"))]));
    expect(second.exits).toEqual([
      { pull: "acme/app#11", outcome: "merged", at: at("10:05"), minutesInQueue: 35 },
      { pull: "acme/app#12", outcome: "dropped", at: at("10:10"), minutesInQueue: 30 },
    ]);
    expect(second.trackingSince).toBe(at("10:00"));
  });

  test("changes nothing when the snapshot is the one it read last", () => {
    const first = trackQueue(undefined, snapshot(at("10:00"), [[11, at("09:30")]], []));
    expect(trackQueue(first, snapshot(at("10:00"), [], []))).toBe(first);
  });

  test("forgets exits older than a week", () => {
    const old = {
      ...trackQueue(undefined, snapshot(at("10:00"), [], [])),
      exits: [
        {
          pull: "acme/app#1",
          outcome: "merged" as const,
          at: "2026-11-14T10:00:00.000Z",
          minutesInQueue: 5,
        },
      ],
    };
    expect(trackQueue(old, snapshot(at("10:10"), [], [])).exits).toEqual([]);
  });

  test("counts merges from the snapshot, and drops and time in queue from the exits", () => {
    const record = {
      ...trackQueue(undefined, snapshot(at("06:00"), [], [])),
      exits: [
        { pull: "acme/app#1", outcome: "merged" as const, at: at("08:00"), minutesInQueue: 20 },
        { pull: "acme/app#2", outcome: "merged" as const, at: at("09:00"), minutesInQueue: 40 },
        { pull: "acme/app#3", outcome: "dropped" as const, at: at("09:30"), minutesInQueue: 15 },
        { pull: "acme/app#4", outcome: "merged" as const, at: at("02:00"), minutesInQueue: 90 },
      ],
    };
    const merged = [pull(1, at("08:00")), pull(2, at("09:00")), pull(5, at("09:50"))];
    const speed = mergeSpeed(record, snapshot(at("10:00"), [], merged), 6, new Date(at("10:00")));
    expect(speed).toEqual({
      hours: 6,
      merges: 3,
      mergesPerHour: 0.5,
      exits: 3,
      dropRate: 0.33,
      medianMinutes: 30,
      longestMinutes: 40,
    });
  });
});

verifies("paperclip.board-check-merge-speed", () => {
  const exits = (minutes: number, count: number, dropped = 0) =>
    Array.from({ length: count }, (_, index) => ({
      pull: `acme/app#${index}`,
      outcome: index < dropped ? ("dropped" as const) : ("merged" as const),
      at: at(`0${5 + (index % 4)}:00`),
      minutesInQueue: minutes,
    }));
  const base = trackQueue(undefined, snapshot(at("04:00"), [], []));

  test("only keeps the first figures, then comments when one moved clearly", () => {
    const now = new Date(at("10:00"));
    const fast = snapshot(at("10:00"), [], []);
    const first = planTrend({ ...base, exits: exits(20, 4) }, fast, now);
    expect(first.comment).toBeUndefined();
    expect(first.record.reported?.medianMinutes).toBe(20);

    const same = planTrend({ ...first.record, exits: exits(25, 4) }, fast, now);
    expect(same.comment).toBeUndefined();

    const slow = planTrend({ ...first.record, exits: exits(60, 4, 2) }, fast, now);
    expect(slow.comment).toBe(
      [
        "Merge speed changed (drop rate, time in queue), last 6 hours:",
        "- Merges: 0 (0 per hour).",
        "- Dropped from the queue without merging: 50% of 4 exits.",
        "- Time in queue of the merged ones: median 60 min, longest 60 min.",
        `Before: 0 merges per hour, 0% dropped, median 20 min. Queue exits counted since ${amsterdamTime(at("04:00"))}.`,
      ].join("\n"),
    );
    expect(slow.record.reported?.medianMinutes).toBe(60);
  });

  test("plans nothing from a snapshot older than 30 minutes", () => {
    const plan = planTrend(base, snapshot(at("09:20"), [], []), new Date(at("10:00")));
    expect(plan).toEqual({ comment: undefined, record: base });
  });

  test("reads back only a record it can use", () => {
    expect(readMergeSpeedRecord(null)).toBeUndefined();
    expect(readMergeSpeedRecord({ trackingSince: at("10:00") })).toBeUndefined();
    expect(readMergeSpeedRecord(base)).toEqual(base);
  });
});
