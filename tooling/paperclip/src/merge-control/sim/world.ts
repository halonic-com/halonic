import type { SimDay, SimPull } from "./day.ts";

/**
 * GitHub's part in the simulator: the merge queue on `main`, its groups and
 * what each jump, removal and failed group throws away. Entry `k`'s group
 * holds every entry ahead of it, so a failure or removal at `k` rebuilds
 * the groups behind it, and a jump rebuilds every group already formed.
 * With more groups building than the runners take, they share the runners
 * and each builds slower. Times are minutes since the day began.
 */

/** One queued entry; `progress` (0 to 1) is null until its group forms. */
export interface SimEntry {
  readonly number: number;
  readonly enqueuedAt: number;
  progress: number | null;
}

/** Why groups were cancelled. */
export type CancelCause = "jump" | "removal" | "failure";

/** A group run that ended, for `decide`'s culprit rule. */
export interface EndedGroup {
  readonly number: number;
  readonly head: string;
  readonly at: number;
  readonly conclusion: "failure" | "cancelled";
}

/** The simulated repository. */
export interface World {
  readonly day: SimDay;
  readonly frontOnRebuild: boolean;
  readonly groupRunnerMinutes: number;
  readonly queue: SimEntry[];
  /** Pushes since the day began, by pull request: the head changes with each. */
  readonly pushes: Map<number, number>;
  /** A held culprit or conflicting pull request gets its new head at this minute. */
  readonly refixAt: Map<number, number>;
  readonly conflicting: Set<number>;
  readonly failed: Set<number>;
  readonly merged: Map<number, number>;
  readonly firstEnqueued: Map<number, number>;
  readonly ended: EndedGroup[];
  readonly cancelled: Record<CancelCause, number>;
  runnerMinutesLost: number;
  jumps: number;
  requeues: number;
}

/** A new world for a day. */
export function newWorld(day: SimDay, frontOnRebuild: boolean, groupRunnerMinutes: number): World {
  return {
    day,
    frontOnRebuild,
    groupRunnerMinutes,
    queue: [],
    pushes: new Map(),
    refixAt: new Map(),
    conflicting: new Set(),
    failed: new Set(),
    merged: new Map(),
    firstEnqueued: new Map(),
    ended: [],
    cancelled: { jump: 0, removal: 0, failure: 0 },
    runnerMinutesLost: 0,
    jumps: 0,
    requeues: 0,
  };
}

/** A pull request's head now: 40 characters, a new one after each push. */
export function headOf(world: World, number: number): string {
  return `${number}${world.pushes.get(number) ?? 0}`.padEnd(40, "a");
}

function pullOf(world: World, number: number): SimPull | undefined {
  return world.day.pulls.find((each) => each.number === number);
}

/** Cancels the formed groups of `entries`; they form again when there is room. */
function cancel(world: World, entries: readonly SimEntry[], minute: number, cause: CancelCause) {
  for (const entry of entries) {
    if (entry.progress === null) {
      continue;
    }
    world.runnerMinutesLost += Math.min(1, entry.progress) * world.groupRunnerMinutes;
    world.cancelled[cause] += 1;
    world.ended.push({
      number: entry.number,
      head: headOf(world, entry.number),
      at: minute,
      conclusion: "cancelled",
    });
    entry.progress = null;
  }
}

/**
 * The candidate rule: when the groups from `from` on rebuild anyway, the
 * controller re-queues them with fast-track pull requests first, at no
 * extra cost (ADR, "front of the line without a rebuild").
 */
function frontOfLine(world: World, from: number): void {
  if (!world.frontOnRebuild) {
    return;
  }
  const rest = world.queue.slice(from);
  const fast = rest.filter((entry) => pullOf(world, entry.number)?.fastTrack === true);
  const reordered = [...fast, ...rest.filter((entry) => !fast.includes(entry))];
  if (reordered.some((entry, index) => entry !== rest[index])) {
    world.requeues += 1;
    world.queue.splice(from, rest.length, ...reordered);
  }
}

/** Forms groups for the entries within GitHub's build limit. */
function formGroups(world: World): void {
  for (const entry of world.queue.slice(0, world.day.timings.buildLimit)) {
    entry.progress ??= 0;
  }
}

/** `decide` enqueued a pull request, at the back or with a jump. */
export function enqueue(world: World, number: number, jump: boolean, minute: number): void {
  const entry: SimEntry = { number, enqueuedAt: minute, progress: null };
  if (!world.firstEnqueued.has(number)) {
    world.firstEnqueued.set(number, minute);
  }
  if (jump) {
    world.jumps += 1;
    cancel(world, world.queue, minute, "jump");
    world.queue.unshift(entry);
  } else {
    world.queue.push(entry);
  }
  formGroups(world);
}

/** Takes an entry out; the groups from it on rebuild. */
function takeOut(world: World, index: number, minute: number, cause: CancelCause): void {
  const [entry] = world.queue.splice(index, 1);
  if (entry !== undefined) {
    cancel(world, [entry], minute, cause);
  }
  cancel(world, world.queue.slice(index), minute, cause);
  frontOfLine(world, index);
  formGroups(world);
}

/** `decide` dequeued a pull request. */
export function dequeue(world: World, number: number, minute: number): void {
  const index = world.queue.findIndex((entry) => entry.number === number);
  if (index >= 0) {
    takeOut(world, index, minute, "removal");
  }
}

/** A failing group: GitHub takes its pull request out and the culprit waits for a new head. */
function failGroup(world: World, index: number, minute: number): void {
  const entry = world.queue[index];
  if (entry === undefined) {
    return;
  }
  world.failed.add(entry.number);
  world.ended.push({
    number: entry.number,
    head: headOf(world, entry.number),
    at: minute,
    conclusion: "failure",
  });
  entry.progress = null;
  world.refixAt.set(entry.number, minute + world.day.timings.refixMinutes);
  takeOut(world, index, minute, "failure");
}

/** Conflicts that start this minute: the entry stays queued until `decide` takes it out. */
function startConflicts(world: World, minute: number, dayStart: number): void {
  for (const pull of world.day.pulls) {
    if (pull.conflictsAt === null || world.conflicting.has(pull.number)) {
      continue;
    }
    const at = Math.floor((Date.parse(pull.conflictsAt) - dayStart) / 60_000);
    if (at === minute && world.queue.some((entry) => entry.number === pull.number)) {
      world.conflicting.add(pull.number);
      world.refixAt.set(pull.number, minute + world.day.timings.refixMinutes);
    }
  }
}

/** New heads for pull requests whose fix is done: they pass the gate again. */
function pushFixes(world: World, minute: number): void {
  for (const [number, at] of world.refixAt) {
    if (at <= minute) {
      world.refixAt.delete(number);
      world.conflicting.delete(number);
      world.pushes.set(number, (world.pushes.get(number) ?? 0) + 1);
    }
  }
}

/** Groups building at once. */
export function building(world: World): number {
  return world.queue.filter((entry) => entry.progress !== null).length;
}

/** A minute of building: groups beyond the runners' share them. */
function advance(world: World): void {
  const { groupBuildMinutes, runnerGroups } = world.day.timings;
  const busy = building(world);
  const rate = runnerGroups === null || busy <= runnerGroups ? 1 : runnerGroups / busy;
  for (const entry of world.queue) {
    if (entry.progress !== null) {
      entry.progress += rate / groupBuildMinutes;
    }
  }
}

/** One minute of GitHub: fixes land, groups finish, fail or merge in order. */
export function tick(world: World, minute: number, dayStart: number): void {
  pushFixes(world, minute);
  startConflicts(world, minute, dayStart);
  advance(world);
  // A conflicting entry's group can't finish: it waits for `decide` to take it out.
  const finished = (entry: SimEntry) =>
    entry.progress !== null && entry.progress >= 1 - 1e-9 && !world.conflicting.has(entry.number);
  const failing = world.queue.findIndex(
    (entry) =>
      finished(entry) &&
      pullOf(world, entry.number)?.failsOnce === true &&
      !world.failed.has(entry.number),
  );
  if (failing >= 0) {
    failGroup(world, failing, minute);
  }
  while (world.queue[0] !== undefined && finished(world.queue[0])) {
    const [entry] = world.queue.splice(0, 1);
    if (entry !== undefined) {
      world.merged.set(entry.number, minute);
    }
  }
  formGroups(world);
}
