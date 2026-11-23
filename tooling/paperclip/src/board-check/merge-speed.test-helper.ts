import type { Snapshot, SnapshotPull } from "../snapshot/shape.ts";

/**
 * Made-up GitHub snapshots of repository acme/app for the merge-speed
 * tests: a queue and the pull requests that merged, all on 22 Nov.
 */

/** 22 Nov at `time` (HH:MM, UTC), ISO. */
export const at = (time: string) => `2026-11-22T${time}:00.000Z`;

/** A pull request into `main`, merged at `mergedAt` when given, open otherwise. */
export function pull(number: number, mergedAt?: string): SnapshotPull {
  return {
    number,
    url: `https://github.com/acme/app/pull/${number}`,
    state: mergedAt === undefined ? "open" : "merged",
    branch: `mateo/HAL-${number}-change`,
    headRepo: "acme/app",
    base: "main",
    head: `head${number}`,
    updatedAt: mergedAt ?? at("09:00"),
    mergedAt: mergedAt ?? null,
    mergeCommit: mergedAt === undefined ? null : `merge${number}`,
    open: null,
  };
}

/** A snapshot taken at `takenAt` with `queued` (number, queued at) in the queue and `pulls` in the list. */
export function snapshot(
  takenAt: string,
  queued: readonly (readonly [number, string])[],
  pulls: readonly SnapshotPull[],
): Snapshot {
  return {
    version: 1,
    takenAt,
    closedWindowDays: 7,
    repos: [
      {
        repo: "acme/app",
        defaultBranch: "main",
        queue: queued.map(([number, enqueuedAt], index) => ({
          number,
          position: index + 1,
          state: "QUEUED",
          enqueuedAt,
          enqueuedBy: "board-member",
          groupHead: null,
          estimatedSeconds: null,
          solo: false,
        })),
        pulls: [...queued.map(([number]) => pull(number)), ...pulls],
      },
    ],
  };
}
