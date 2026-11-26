import { decide } from "../decide.ts";
import { defaultSettings, emptyMergeState, type MergeSettings, type MergeState } from "../state.ts";
import { minutesBetween, type SimDay, type Spread, spreadOf } from "./day.ts";
import { factsAt } from "./facts.ts";
import { dequeue, enqueue, newWorld, tick, type World } from "./world.ts";

/**
 * The day simulator (merge controller ADR, HAL-17700): steps a recorded day
 * a minute at a time, runs `decide` with a rule set on each minute, carries
 * its enqueues and dequeues out on a simulated queue, and reports what the
 * rule set cost.
 */

/** A rule set to replay a day with. */
export interface RuleSet {
  readonly name: string;
  readonly settings: MergeSettings;
  /** The candidate rule: never jump, put fast-track first when the queue rebuilds anyway. */
  readonly frontOnRebuild: boolean;
  /** No jump while runners are short (HAL-17703); the Merger had no such gate. */
  readonly capacityGate: boolean;
}

/**
 * The settings the rule sets start from: today's, with a stand-in for the
 * board's queue login, so the simulated day's `fast-track` labels count as
 * the board's (its login comes from config, never from code).
 */
const simSettings: MergeSettings = { ...defaultSettings, fastTrackLabellers: ["board-queue"] };

/** Today's rule: fast-track jumps with more than 8 queued (HAL-15971, HAL-17697). */
export const jumpOver8: RuleSet = {
  name: "jump >8 (today)",
  settings: simSettings,
  frontOnRebuild: false,
  capacityGate: true,
};

/** The rule before HAL-17697 tightened it, with the capacity gate. */
export const jumpOver3: RuleSet = {
  name: "jump >3",
  settings: { ...simSettings, jumpAhead: 3 },
  frontOnRebuild: false,
  capacityGate: true,
};

/** The Merger on 24 Nov until 18:15: jump with more than 3 queued, no capacity gate. */
export const mergerBefore1815: RuleSet = {
  name: "the Merger until 18:15 (jump >3, no capacity gate)",
  settings: { ...simSettings, jumpAhead: 3 },
  frontOnRebuild: false,
  capacityGate: false,
};

/** "Front of the line without a rebuild" (ADR, board 24 Nov 17:47). */
export const frontOfLine: RuleSet = {
  name: "front of the line without a rebuild",
  settings: { ...simSettings, jumpAhead: Number.POSITIVE_INFINITY },
  frontOnRebuild: true,
  capacityGate: true,
};

/** What one rule set did to the day. */
export interface SimReport {
  readonly rules: string;
  readonly merged: number;
  readonly notMerged: number;
  /** From ready to merged. */
  readonly timeToMerge: { readonly fastTrack: Spread; readonly other: Spread };
  /** From the first enqueue to merged. */
  readonly queueWait: Spread;
  readonly jumps: number;
  readonly groupsCancelled: {
    readonly byJumps: number;
    readonly byRemovals: number;
    /** Rebuilt behind a failed group: GitHub does that under every rule set. */
    readonly byFailures: number;
  };
  readonly runnerMinutesLost: number;
  /** Times the candidate rule put fast-track first in a rebuild. */
  readonly requeues: number;
}

/** After the day ends, the simulator runs on this long for the queue to drain. */
export const drainMinutes = 360;

function reportOf(world: World, rules: RuleSet, dayStart: number): SimReport {
  const readyMinute = (readyAt: string) => (Date.parse(readyAt) - dayStart) / 60_000;
  const ttm = (fast: boolean) =>
    world.day.pulls
      .filter((pull) => pull.fastTrack === fast && world.merged.has(pull.number))
      .map((pull) => (world.merged.get(pull.number) ?? 0) - readyMinute(pull.readyAt));
  const waits = [...world.merged].map(
    ([number, at]) => at - (world.firstEnqueued.get(number) ?? at),
  );
  return {
    rules: rules.name,
    merged: world.merged.size,
    notMerged: world.day.pulls.length - world.merged.size,
    timeToMerge: { fastTrack: spreadOf(ttm(true)), other: spreadOf(ttm(false)) },
    queueWait: spreadOf(waits),
    jumps: world.jumps,
    groupsCancelled: {
      byJumps: world.cancelled.jump,
      byRemovals: world.cancelled.removal,
      byFailures: world.cancelled.failure,
    },
    runnerMinutesLost: Math.round(world.runnerMinutesLost),
    requeues: world.requeues,
  };
}

/** Replays `day` under `rules`. The same day and rules always give the same report. */
export function simulate(day: SimDay, rules: RuleSet): SimReport {
  const dayStart = Date.parse(`${day.date}T00:00:00Z`);
  const world = newWorld(day, rules.frontOnRebuild, rules.settings.groupRunnerMinutes);
  let state: MergeState = emptyMergeState;
  const lastReady = Math.max(
    0,
    ...day.pulls.map((pull) => minutesBetween(`${day.date}T00:00:00Z`, pull.readyAt)),
  );
  const end = Math.max(24 * 60, Math.ceil(lastReady)) + drainMinutes;
  for (let minute = 0; minute <= end; minute += 1) {
    tick(world, minute, dayStart);
    const decision = decide(
      factsAt(world, minute, dayStart, rules.settings, rules.capacityGate),
      state,
      rules.settings,
      new Date(dayStart + minute * 60_000),
    );
    state = decision.state;
    for (const action of decision.actions) {
      if (action.kind === "enqueue") {
        enqueue(world, action.number, action.jump, minute);
      } else if (action.kind === "dequeue") {
        dequeue(world, action.number, minute);
      }
    }
    if (world.merged.size === day.pulls.length) {
      break;
    }
  }
  return reportOf(world, rules, dayStart);
}
