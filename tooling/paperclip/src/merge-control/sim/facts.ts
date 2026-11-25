import { fastTrackLabel } from "../../pr-tools/queue-state.ts";
import type { CheckFact, GatePull, GroupRun, MergeSnapshot, QueueEntry } from "../snapshot.ts";
import type { MergeSettings } from "../state.ts";
import type { SimPull } from "./day.ts";
import { building, headOf, type World } from "./world.ts";

/**
 * The snapshot `decide` reads in the simulator: every pull request that is
 * ready and not merged, with a signed approval on its head and green checks,
 * so only the day's queue, failures and conflicts hold it back.
 */

function iso(dayStart: number, minute: number): string {
  return new Date(dayStart + minute * 60_000).toISOString();
}

function check(name: string, workflow: string, at: string): CheckFact {
  return {
    name,
    workflow,
    event: "pull_request",
    status: "completed",
    conclusion: "success",
    runCreatedAt: at,
    startedAt: at,
    url: `https://github.com/acme/sim/actions/runs/1/job/${name.length}`,
  };
}

function gatePull(
  world: World,
  pull: SimPull,
  at: (minutesAgo: number) => string,
  settings: MergeSettings,
): GatePull {
  const head = headOf(world, pull.number);
  const fast = pull.fastTrack;
  const files = pull.files.length > 0 ? pull.files : [`packages/sim/pull-${pull.number}.ts`];
  return {
    number: pull.number,
    id: `PR_${pull.number}`,
    title: `feat(sim): pull request ${pull.number}`,
    branch: `sim/HAL-${pull.number}-replay`,
    base: "main",
    head,
    createdAt: pull.readyAt,
    draft: false,
    labels: fast ? ["built-on:paperclip", fastTrackLabel] : ["built-on:paperclip"],
    crossRepository: false,
    headOwner: settings.owner,
    additions: 10,
    deletions: 0,
    mergeable: world.conflicting.has(pull.number) ? "CONFLICTING" : "MERGEABLE",
    mergeStateStatus: "CLEAN",
    files,
    filesTotal: files.length,
    fileNet: {},
    manifests: undefined,
    headCommittedAt: at(30),
    forcePushedAt: [],
    retargetedAt: [],
    queueExit: null,
    texts: [
      {
        kind: "comment",
        by: settings.teamLogin,
        at: at(10),
        body: `Liam: approved on head \`${head.slice(0, 7)}\``,
      },
    ],
    checks: ["ci-ok", "Guard notes", "Built-on label"].map((name) =>
      check(name, name === "ci-ok" ? "CI" : name, at(20)),
    ),
    liveCloud: [],
    ciRun: null,
    fastTrackBy: fast ? (settings.fastTrackLabellers[0] ?? null) : null,
    ciOkRun: null,
  };
}

function queueOf(world: World, at: (minute: number) => string): QueueEntry[] {
  return world.queue.map((entry, index) => {
    let state: QueueEntry["state"] = entry.progress === null ? "QUEUED" : "AWAITING_CHECKS";
    if (world.conflicting.has(entry.number)) {
      state = "UNMERGEABLE";
    }
    return {
      number: entry.number,
      position: index + 1,
      state,
      enqueuedAt: at(entry.enqueuedAt),
      groupHead: entry.progress === null ? null : `group-${entry.number}`,
    };
  });
}

function groupRuns(world: World, minute: number, at: (minute: number) => string): GroupRun[] {
  return world.ended
    .map((ended, index) => ({ ended, id: index + 1 }))
    .filter(({ ended }) => minute - ended.at < 180)
    .map(({ ended, id }) => ({
      id,
      conclusion: ended.conclusion,
      branch: `gh-readonly-queue/main/pr-${ended.number}-${ended.head.slice(0, 4)}`,
      url: `https://github.com/acme/sim/actions/runs/${id}`,
      createdAt: at(ended.at),
      failedJobs:
        ended.conclusion === "failure"
          ? [{ id, name: "Typecheck, lint, test, build", url: "", failedSteps: [] }]
          : [],
    }));
}

/** Free runner room in groups: always some when unknown or when the rule set has no capacity gate. */
function freeSlots(world: World, capacityGate: boolean): number {
  const runners = world.day.timings.runnerGroups;
  return runners === null || !capacityGate ? 1 : Math.max(0, runners - building(world));
}

/** The snapshot at `minute`, for `decide`. */
export function factsAt(
  world: World,
  minute: number,
  dayStart: number,
  settings: MergeSettings,
  capacityGate: boolean,
): MergeSnapshot {
  const at = (when: number) => iso(dayStart, when);
  const ago = (minutes: number) => at(minute - minutes);
  const visible = world.day.pulls.filter(
    (pull) =>
      Date.parse(pull.readyAt) <= dayStart + minute * 60_000 && !world.merged.has(pull.number),
  );
  const pulls = visible.map((pull) => gatePull(world, pull, ago, settings));
  return {
    takenAt: at(minute),
    queue: queueOf(world, at),
    pulls,
    open: pulls.map(({ number, branch, base, head }) => ({ number, branch, base, head })),
    merged: [...world.merged].map(([number, when]) => ({ number, mergedAt: at(when) })),
    tasks: [],
    mainFiles: {},
    patchIds: {},
    groupRuns: groupRuns(world, minute, at),
    mergeGroupRuns: [],
    queuedPullRuns: [],
    runnerWaitMinutes: 0,
    capacity: {
      freeQueueSlots: freeSlots(world, capacityGate),
      waitingByLabel: {},
      cancelledGroupsLastHour: 0,
    },
    mainRuns: [],
  };
}
