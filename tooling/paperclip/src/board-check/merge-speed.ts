import { amsterdamTime } from "../amsterdam-time.ts";
import type { Snapshot, SnapshotPull } from "../snapshot/shape.ts";

/**
 * Part (e) of the board check: merge speed, from the PR watcher's GitHub
 * snapshot. Merges are counted from the snapshot's merged pull requests.
 * Time in the queue and drops need what the queue looked like before, so
 * each pass compares the snapshot's queue with the one it kept: a pull
 * request gone from the queue has either merged or been dropped. Exits
 * before the first pass are unknown, so those two figures fill up over the
 * first hours. Pull request numbers, states and times only.
 */

/** A pull request that left the queue, merged or not. */
export interface QueueExit {
  /** `owner/name#number`. */
  readonly pull: string;
  readonly outcome: "merged" | "dropped";
  /** When it left: the merge time, or the snapshot that first missed it. */
  readonly at: string;
  readonly minutesInQueue: number;
}

/** The figures for one window of time. */
export interface MergeSpeed {
  readonly hours: number;
  readonly merges: number;
  readonly mergesPerHour: number;
  /** Merged and dropped queue exits seen in the window. */
  readonly exits: number;
  /** Dropped exits over all exits, or null with none. */
  readonly dropRate: number | null;
  /** Median minutes in the queue of the merged exits, or null with none. */
  readonly medianMinutes: number | null;
  readonly longestMinutes: number | null;
}

/** What the board check keeps between passes. */
export interface MergeSpeedRecord {
  /** When the first pass saw the queue; exits before it are unknown. */
  readonly trackingSince: string;
  /** The snapshot the last pass read, so a pass without a new one changes nothing. */
  readonly snapshotAt: string;
  /** The queue at that snapshot: `owner/name#number` and when it was queued. */
  readonly queued: readonly { readonly pull: string; readonly enqueuedAt: string }[];
  /** Exits of the last week, oldest first. */
  readonly exits: readonly QueueExit[];
  /** The 6-hour figures the last trend comment named, or the first ones taken. */
  readonly reported: MergeSpeed | null;
}

/** Exits older than this are dropped from the record; `merge_speed` reads at most this far back. */
export const keepHours = 7 * 24;

/** The trend window the hourly comment compares. */
export const trendHours = 6;

/** A snapshot older than this isn't used for the hourly comment. */
export const staleMinutes = 30;

const hourMs = 60 * 60_000;
const minutes = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 60_000);

function queueOf(snapshot: Snapshot) {
  return snapshot.repos.flatMap((repo) =>
    repo.queue.map((entry) => ({
      pull: `${repo.repo}#${entry.number}`,
      enqueuedAt: entry.enqueuedAt,
    })),
  );
}

function pullsOf(snapshot: Snapshot) {
  return new Map<string, SnapshotPull>(
    snapshot.repos.flatMap((repo) =>
      repo.pulls.map((pull) => [`${repo.repo}#${pull.number}`, pull] as const),
    ),
  );
}

/**
 * The record after reading `snapshot`: entries gone from the queue become
 * exits, and the queue is replaced. The same snapshot twice changes nothing.
 */
export function trackQueue(
  record: MergeSpeedRecord | undefined,
  snapshot: Snapshot,
): MergeSpeedRecord {
  const queued = queueOf(snapshot);
  if (record === undefined) {
    return {
      trackingSince: snapshot.takenAt,
      snapshotAt: snapshot.takenAt,
      queued,
      exits: [],
      reported: null,
    };
  }
  if (record.snapshotAt === snapshot.takenAt) {
    return record;
  }
  const stillQueued = new Set(queued.map((entry) => entry.pull));
  const pulls = pullsOf(snapshot);
  const exits = record.queued
    .filter((entry) => !stillQueued.has(entry.pull))
    .map((entry): QueueExit => {
      const merged = pulls.get(entry.pull)?.mergedAt ?? null;
      const at = merged ?? snapshot.takenAt;
      return {
        pull: entry.pull,
        outcome: merged === null ? "dropped" : "merged",
        at,
        minutesInQueue: Math.max(0, minutes(entry.enqueuedAt, at)),
      };
    });
  const keepFrom = Date.parse(snapshot.takenAt) - keepHours * hourMs;
  return {
    ...record,
    snapshotAt: snapshot.takenAt,
    queued,
    exits: [...record.exits, ...exits].filter((exit) => Date.parse(exit.at) >= keepFrom),
  };
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : Math.round(((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2);
}

/** The figures for the `hours` before `now`: merges from the snapshot, the rest from the exits. */
export function mergeSpeed(
  record: MergeSpeedRecord,
  snapshot: Snapshot,
  hours: number,
  now: Date,
): MergeSpeed {
  const from = now.getTime() - hours * hourMs;
  const inWindow = (time: string | null) => time !== null && Date.parse(time) >= from;
  const merges = snapshot.repos.reduce(
    (sum, repo) =>
      sum +
      repo.pulls.filter((pull) => pull.base === repo.defaultBranch && inWindow(pull.mergedAt))
        .length,
    0,
  );
  const exits = record.exits.filter((exit) => inWindow(exit.at));
  const merged = exits
    .filter((exit) => exit.outcome === "merged")
    .map((exit) => exit.minutesInQueue);
  return {
    hours,
    merges,
    mergesPerHour: Math.round((merges / hours) * 10) / 10,
    exits: exits.length,
    dropRate:
      exits.length === 0
        ? null
        : Math.round(((exits.length - merged.length) / exits.length) * 100) / 100,
    medianMinutes: median(merged),
    longestMinutes: merged.length === 0 ? null : Math.max(...merged),
  };
}

/** How far a figure must move from the last reported one for a comment. */
export const thresholds = {
  /** Merges per hour: at least this many more or fewer, and half again or half as many. */
  mergesPerHour: 1,
  /** Drop rate: at least this much, over at least `minExits` exits. */
  dropRate: 0.2,
  minExits: 3,
  /** Median time in queue: at least this many minutes, and half again or half as long. */
  medianMinutes: 15,
} as const;

const movedByHalf = (before: number, now: number) => now >= before * 1.5 || now <= before * 0.5;

/** The figures that moved clearly since `before`, by name. */
export function clearChanges(before: MergeSpeed, now: MergeSpeed): string[] {
  const changes: string[] = [];
  if (
    Math.abs(now.mergesPerHour - before.mergesPerHour) >= thresholds.mergesPerHour &&
    movedByHalf(before.mergesPerHour, now.mergesPerHour)
  ) {
    changes.push("merges per hour");
  }
  if (
    now.dropRate !== null &&
    before.dropRate !== null &&
    now.exits >= thresholds.minExits &&
    Math.abs(now.dropRate - before.dropRate) >= thresholds.dropRate
  ) {
    changes.push("drop rate");
  }
  if (
    now.medianMinutes !== null &&
    before.medianMinutes !== null &&
    Math.abs(now.medianMinutes - before.medianMinutes) >= thresholds.medianMinutes &&
    movedByHalf(before.medianMinutes, now.medianMinutes)
  ) {
    changes.push("time in queue");
  }
  return changes;
}

const percent = (rate: number | null) =>
  rate === null ? "none left the queue" : `${Math.round(rate * 100)}%`;
const inQueue = (value: number | null) => (value === null ? "no merge seen" : `${value} min`);

/** The figures as lines, for the trend comment and `merge_speed`. */
export function speedLines(speed: MergeSpeed): string[] {
  return [
    `- Merges: ${speed.merges} (${speed.mergesPerHour} per hour).`,
    `- Dropped from the queue without merging: ${percent(speed.dropRate)} of ${speed.exits} exits.`,
    `- Time in queue of the merged ones: median ${inQueue(speed.medianMinutes)}, longest ${inQueue(speed.longestMinutes)}.`,
  ];
}

/** What part (e) wants written this pass, and the record to save once it went through. */
export interface MergeSpeedPlan {
  readonly comment: string | undefined;
  readonly record: MergeSpeedRecord;
}

/**
 * Plans the hourly trend comment. The first figures are only kept; after
 * that a comment goes out when a figure moved clearly from the last
 * reported ones, which it then replaces. A stale snapshot plans nothing.
 */
export function planTrend(record: MergeSpeedRecord, snapshot: Snapshot, now: Date): MergeSpeedPlan {
  if (now.getTime() - Date.parse(snapshot.takenAt) > staleMinutes * 60_000) {
    return { comment: undefined, record };
  }
  const speed = mergeSpeed(record, snapshot, trendHours, now);
  if (record.reported === null) {
    return { comment: undefined, record: { ...record, reported: speed } };
  }
  const changes = clearChanges(record.reported, speed);
  if (changes.length === 0) {
    return { comment: undefined, record };
  }
  return {
    comment: [
      `Merge speed changed (${changes.join(", ")}), last ${trendHours} hours:`,
      ...speedLines(speed),
      `Before: ${record.reported.mergesPerHour} merges per hour, ${percent(record.reported.dropRate)} dropped, median ${inQueue(record.reported.medianMinutes)}. Queue exits counted since ${amsterdamTime(record.trackingSince)}.`,
    ].join("\n"),
    record: { ...record, reported: speed },
  };
}

/** Reads the saved record back; undefined when nothing usable was saved. */
export function readMergeSpeedRecord(value: unknown): MergeSpeedRecord | undefined {
  const record = value as Partial<MergeSpeedRecord> | null;
  return record !== null &&
    typeof record === "object" &&
    typeof record.trackingSince === "string" &&
    typeof record.snapshotAt === "string" &&
    Array.isArray(record.queued) &&
    Array.isArray(record.exits)
    ? { ...(record as MergeSpeedRecord), reported: record.reported ?? null }
    : undefined;
}
