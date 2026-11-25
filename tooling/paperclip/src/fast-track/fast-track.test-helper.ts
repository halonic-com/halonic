import type { OpenFacts, QueueEntry, SnapshotPull, SnapshotRepo } from "../snapshot/shape.ts";

/** The time every fast-track test runs at. */
export const now = new Date("2026-11-23T12:00:00Z");

/** `minutes` before `now`, ISO. */
export function ago(minutes: number): string {
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}

export const head = "abc1234def5678900000000000000000000000000";

/** The board's GitHub login in these tests, a placeholder for the real one. */
export const boardLogin = "board-member";

/** The pass's settings, with the board's placeholder login, nothing that unblocks and nothing in `halonic-dev`'s scope. */
export const settings = {
  unblocks: new Set<number>(),
  labelAdder: boardLogin,
  sharedScope: { pulls: new Set<string>(), tasks: new Set<string>() },
};

/** An open, ready, green `fast-track` pull request labelled by the board an hour ago, with changes. */
export function pull(
  number: number,
  open: Partial<OpenFacts> = {},
  changes: Partial<SnapshotPull> = {},
): SnapshotPull {
  return {
    number,
    url: `https://github.com/acme/tools/pull/${number}`,
    state: "open",
    branch: `mateo/HAL-${number}-thing`,
    headRepo: "acme/tools",
    base: "main",
    head,
    updatedAt: ago(5),
    mergedAt: null,
    mergeCommit: null,
    open: {
      draft: false,
      mergeable: "yes",
      ciOk: "success",
      draftCiOk: "missing",
      inQueue: false,
      labels: [{ name: "fast-track", addedBy: boardLogin, addedAt: ago(60) }],
      finding: null,
      approvals: [],
      failingChecks: [],
      pendingChecks: [],
      author: "halonic-dev",
      ...open,
    },
    ...changes,
  };
}

/** A merged pull request, merged `minutes` ago. */
export function merged(number: number, minutes: number): SnapshotPull {
  return { ...pull(number), state: "merged", mergedAt: ago(minutes), open: null };
}

/** A merge-queue entry. */
export function entry(
  number: number,
  position: number,
  changes: Partial<QueueEntry> = {},
): QueueEntry {
  return {
    number,
    position,
    state: "AWAITING_CHECKS",
    enqueuedAt: ago(5),
    enqueuedBy: boardLogin,
    groupHead: `group${number}`,
    estimatedSeconds: null,
    solo: false,
    groupCiOk: "pending",
    jobsWaiting: 0,
    waitingSince: null,
    ...changes,
  };
}

/** The repository `acme/tools` with these pull requests and queue. */
export function repo(
  pulls: readonly SnapshotPull[],
  queue: readonly QueueEntry[] = [],
): SnapshotRepo {
  return { repo: "acme/tools", defaultBranch: "main", queue, pulls };
}

/** Liam's signed approval on the test head. */
export const liamApproved = { approvals: [{ by: "Liam", head: head.slice(0, 7) }] };
