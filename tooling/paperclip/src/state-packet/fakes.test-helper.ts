import { fakeState } from "../plugin/fake-host.test-helper.ts";
import type { PrStatus } from "../pr-tools/pr-status.ts";
import type { CheckState } from "../pr-watcher/decide.ts";
import type { Snapshot, SnapshotPull } from "../snapshot/shape.ts";
import type { PacketDeps } from "./build.ts";
import { freshLines } from "./fresh-store.ts";
import type { PacketComment } from "./packet.ts";

/** The fakes' time: the wake fires at 16:00. */
export const now = new Date("2026-11-25T16:00:00Z");

/** A time this many minutes before `now`, ISO. */
export function minutesAgo(minutes: number): string {
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}

export const repo = "acme/rockets";
export const head = "f00d0001f00d0001f00d0001f00d0001f00d0001";
export const mergeCommit = "beef0002beef0002beef0002beef0002beef0002";

/** An open pull request as the watcher saw it: green, mergeable, approved by Liam on its head. */
export function openPull(number: number, branch: string): SnapshotPull {
  return {
    number,
    url: `https://github.com/${repo}/pull/${number}`,
    state: "open",
    branch,
    headRepo: repo,
    base: "main",
    head,
    updatedAt: minutesAgo(30),
    mergedAt: null,
    mergeCommit: null,
    open: {
      draft: false,
      mergeable: "yes",
      ciOk: "success",
      draftCiOk: "missing",
      inQueue: true,
      labels: [],
      finding: null,
      approvals: [{ by: "Liam", head: head.slice(0, 7) }],
    },
  };
}

/** A pull request that merged an hour ago. */
export function mergedPull(number: number, branch: string): SnapshotPull {
  return {
    ...openPull(number, branch),
    state: "merged",
    mergedAt: minutesAgo(60),
    mergeCommit,
    open: null,
  };
}

/** The watcher's snapshot with these pull requests, #41 second in the merge queue. */
export function snapshot(pulls: readonly SnapshotPull[], takenAt = minutesAgo(2)): Snapshot {
  const queueEntry = {
    number: 41,
    position: 2,
    state: "AWAITING_CHECKS",
    enqueuedAt: minutesAgo(20),
    enqueuedBy: null,
    groupHead: null,
    estimatedSeconds: null,
    solo: false,
  };
  return {
    version: 1,
    takenAt,
    closedWindowDays: 3,
    repos: [{ repo, defaultBranch: "main", queue: [queueEntry], pulls }],
  };
}

/** What a fresh `pr_status` read says: #41 now red and no longer queued. */
export function freshStatus(number: number): PrStatus {
  return {
    repo,
    number,
    url: `https://github.com/${repo}/pull/${number}`,
    state: "open",
    draft: false,
    branch: `ada/HAL-${number}-fuel`,
    base: "main",
    author: "ada",
    task: `HAL-${number}`,
    head,
    ciOk: "failure",
    mergeable: "yes",
    behindBase: 0,
    inQueue: false,
    approvals: [],
    approvedOnHead: false,
    reviewer: "liam",
    changedLines: 40,
    securityFile: undefined,
    latestReviewFinding: undefined,
    requiredWorkflows: [],
  };
}

/** What the fakes are given; anything left out is the happy path. */
export interface FakeInput {
  readonly enabled?: boolean;
  readonly snapshot?: Snapshot | Error;
  readonly comments?: readonly PacketComment[];
  readonly mergeCiOk?: CheckState;
  readonly githubFails?: boolean;
}

/** Fake reads for the packet, recording every GitHub read; the kept lines are in real plugin state. */
export function fakeDeps(input: FakeInput) {
  const reads: string[] = [];
  const { state, saved } = fakeState();
  const github = {
    status: async (name: string, number: number) => {
      reads.push(`status ${name}#${number}`);
      if (input.githubFails === true) throw new Error("GitHub answered 502");
      return freshStatus(number);
    },
    ciOk: async (name: string, commit: string) => {
      reads.push(`ci-ok ${name}@${commit.slice(0, 7)}`);
      return input.mergeCiOk ?? "success";
    },
  };
  const deps: PacketDeps = {
    enabled: async () => input.enabled ?? true,
    taskIdentifier: async (issueId) => (issueId === "task-41" ? "HAL-41" : undefined),
    snapshot: async () => {
      if (input.snapshot instanceof Error) throw input.snapshot;
      return input.snapshot ?? snapshot([openPull(41, "ada/HAL-41-fuel")]);
    },
    fresh: freshLines({ state }),
    github: async () => github,
    comments: async () => input.comments ?? [],
    now: () => now,
  };
  return { deps, reads, saved, state };
}

/** The request the server sends before HAL-41's monitor wake. */
export const monitorWake = {
  companyId: "company-1",
  issueId: "task-41",
  wakeReason: "issue_monitor_due",
} as const;
