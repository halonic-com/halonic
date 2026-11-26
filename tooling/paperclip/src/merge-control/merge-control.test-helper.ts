import { decide } from "./decide.ts";
import type { CheckFact, GatePull, MergeSnapshot, PullText, QueueEntry } from "./snapshot.ts";
import {
  type Decision,
  defaultSettings,
  emptyMergeState,
  type MergeAction,
  type MergeSettings,
  type MergeState,
} from "./state.ts";

/**
 * Fixture snapshots for the merge-control tests: by default a pull request
 * passes every gate rule, so each test changes only the fact its rule reads.
 */

/** The board's login, as the plugin's config gives it. */
export const boardLogin = "board-member";

/** Today's settings with the board's login from config added. */
export const testSettings: MergeSettings = {
  ...defaultSettings,
  fastTrackLabellers: [boardLogin, ...defaultSettings.fastTrackLabellers],
};

/** The time every merge-control test runs at. */
export const now = new Date("2026-11-24T12:00:00Z");

/** `minutes` before `now`, ISO. */
export function ago(minutes: number): string {
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}

/** A 40-character head for pull request `number`, optionally a later push `n`. */
export function headOf(number: number, n = 0): string {
  return `${String(number).padStart(4, "0")}${n}`.padEnd(40, "a");
}

/** A team comment at `minutes` ago. */
export function said(body: string, minutes = 30, extra: Partial<PullText> = {}): PullText {
  return { kind: "comment", by: "halonic-dev", at: ago(minutes), body, ...extra };
}

/** A finished check run on the pull request's head. */
export function check(name: string, workflow: string, extra: Partial<CheckFact> = {}): CheckFact {
  return {
    name,
    workflow,
    event: "pull_request",
    status: "completed",
    conclusion: "success",
    runCreatedAt: ago(50),
    startedAt: ago(50),
    url: `https://github.com/acme/tools/actions/runs/1/job/${name.length}`,
    ...extra,
  };
}

/** The checks of a green head. */
export function greenChecks(): CheckFact[] {
  return [
    check("ci-ok", "CI"),
    check("Lint", "CI"),
    check("guard", "Guard notes"),
    check("label", "Built-on label"),
  ];
}

/** An open pull request that passes the gate: Liam approved its head after the last push, all green. */
export function pull(number: number, changes: Partial<GatePull> = {}): GatePull {
  const head = changes.head ?? headOf(number);
  return {
    number,
    id: `PR_${number}`,
    title: `feat(tools): thing ${number} (HAL-${number})`,
    branch: `mateo/HAL-${number}-thing`,
    base: "main",
    head,
    createdAt: ago(600 - number),
    draft: false,
    author: "halonic-dev",
    labels: ["built-on:paperclip"],
    crossRepository: false,
    headOwner: "halonic-com",
    additions: 40,
    deletions: 10,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    files: [`packages/core/thing-${number}/src/thing.ts`],
    filesTotal: 1,
    fileNet: { [`packages/core/thing-${number}/src/thing.ts`]: 30 },
    manifests: undefined,
    headCommittedAt: ago(60),
    forcePushedAt: [],
    retargetedAt: [],
    queueExit: null,
    texts: [said(`Liam: approved on head \`${head.slice(0, 7)}\``)],
    checks: greenChecks(),
    liveCloud: [],
    ciRun: { id: 9000 + number, status: "completed", createdAt: ago(55) },
    fastTrackBy: null,
    ciOkRun: null,
    ...changes,
  };
}

/** A queue entry at `position`. */
export function entry(
  number: number,
  position: number,
  extra: Partial<QueueEntry> = {},
): QueueEntry {
  return {
    number,
    position,
    state: "AWAITING_CHECKS",
    enqueuedAt: ago(10),
    groupHead: `group-${number}`,
    ...extra,
  };
}

/** A snapshot with these pull requests and nothing else going on. */
export function snapshot(changes: Partial<MergeSnapshot> = {}): MergeSnapshot {
  const pulls = changes.pulls ?? [];
  return {
    takenAt: now.toISOString(),
    queue: [],
    pulls,
    open: pulls.map(({ number, branch, base, head }) => ({ number, branch, base, head })),
    merged: [],
    tasks: [],
    mainFiles: {},
    patchIds: {},
    groupRuns: [],
    mergeGroupRuns: [],
    queuedPullRuns: [],
    runnerWaitMinutes: 0,
    capacity: { freeQueueSlots: 4, waitingByLabel: {}, cancelledGroupsLastHour: 0 },
    mainRuns: [],
    ...changes,
  };
}

/** A state with these changes. */
export function stateWith(changes: Partial<MergeState> = {}): MergeState {
  return { ...emptyMergeState, ...changes };
}

/** One pass at `now`. */
export function pass(
  facts: MergeSnapshot,
  state: MergeState = emptyMergeState,
  settings: MergeSettings = testSettings,
): Decision {
  return decide(facts, state, settings, now);
}

/** The actions of one kind. */
export function actionsOf<K extends MergeAction["kind"]>(
  decision: Decision,
  kind: K,
): Extract<MergeAction, { kind: K }>[] {
  return decision.actions.filter(
    (action): action is Extract<MergeAction, { kind: K }> => action.kind === kind,
  );
}

/** The numbers enqueued, in order. */
export function enqueued(decision: Decision): number[] {
  return actionsOf(decision, "enqueue").map((action) => action.number);
}

/** The log lines' texts. */
export function logText(decision: Decision): string {
  return decision.log.map((line) => line.text).join("\n");
}
