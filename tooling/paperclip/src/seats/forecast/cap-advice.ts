/**
 * Cap advice (`seats.plan`): when the pool runs out before the next big
 * refill, which concurrent run caps to lower so it lasts until then. Caps
 * are the board's decision, so this is a proposal only.
 *
 * It uses the cautious P90 run-out, the same one the pool alert uses. Cuts
 * go one run at a time, to the agent cut least so far, heaviest first among
 * equals, so the advice spreads over the heavy agents ("caps -1 for the
 * heavy agents") before it cuts any one of them twice. A cut that costs the
 * agent nothing (it has less work than its cap) is never proposed.
 */

import { demandAt } from "./demand.ts";
import { forecastPool } from "./pool.ts";
import { capFactor, currentScenario, scenarioProfiles } from "./scenarios.ts";
import { forecastSeats, type SeatForecastInput } from "./seat-forecast.ts";
import type { AgentActivity, AgentId } from "./types.ts";
import type { Refill } from "./window-walk.ts";

/** The cap advice's settings; the board can change them in the plugin's settings. */
export interface CapAdviceSettings {
  /** A weekly reset counts as a big refill when it gives back at least this many points. */
  readonly bigRefillPoints: number;
  /** Advice never takes an agent's cap below this. */
  readonly lowestCap: number;
}

export const defaultCapAdviceSettings: CapAdviceSettings = { bigRefillPoints: 50, lowestCap: 1 };

/** The proposed cap cuts, and when the pool runs out (P90) without and with them. */
export interface CapAdvice {
  /** The next big refill; undefined when none comes within 7 days, and the pool must last two weeks. */
  readonly refillAt: string | undefined;
  readonly runOutBefore: string;
  /** Change to each named agent's cap, e.g. -1. */
  readonly capDelta: Readonly<Record<AgentId, number>>;
  /** Undefined when the pool lasts two weeks with the cuts. */
  readonly runOutAfter: string | undefined;
  /** Whether the cuts make the pool last until the refill; false when no cap can go lower. */
  readonly enough: boolean;
}

/** The first weekly reset in the next 7 days that gives back at least `bigRefillPoints`. */
export function nextBigRefill(
  refills: readonly Refill[],
  settings: CapAdviceSettings,
): Refill | undefined {
  return refills.find(
    (refill) => refill.window === "week" && refill.points >= settings.bigRefillPoints,
  );
}

/** The agent to cut next: cut least so far, then heaviest; undefined when no cut helps. */
function nextCut(
  heaviestFirst: readonly AgentId[],
  activityOf: ReadonlyMap<AgentId, AgentActivity>,
  capDelta: Readonly<Record<AgentId, number>>,
  settings: CapAdviceSettings,
): AgentId | undefined {
  const cuttable = heaviestFirst.filter((agentId) => {
    const activity = activityOf.get(agentId);
    const delta = capDelta[agentId] ?? 0;
    if (activity?.cap === undefined || activity.cap + delta - 1 < settings.lowestCap) {
      return false;
    }
    return capFactor(activity, delta - 1) < capFactor(activity, delta);
  });
  const leastCut = Math.max(...cuttable.map((agentId) => capDelta[agentId] ?? 0));
  return cuttable.find((agentId) => (capDelta[agentId] ?? 0) === leastCut);
}

/**
 * The cap advice at `input.now`, or undefined when the pool (P90) lasts until
 * the next big refill, or has no weekly readings to forecast from.
 */
export function adviseCaps(
  input: SeatForecastInput,
  activities: readonly AgentActivity[],
  settings: CapAdviceSettings = defaultCapAdviceSettings,
): CapAdvice | undefined {
  const refill = nextBigRefill(forecastSeats(input).refills, settings);
  const deadlineMs = refill === undefined ? Number.POSITIVE_INFINITY : Date.parse(refill.at);
  const lastsUntilRefill = (runOut: string | undefined) =>
    runOut === undefined || Date.parse(runOut) >= deadlineMs;
  const runOutWith = (capDelta: Readonly<Record<AgentId, number>>) => {
    const scenario = { ...currentScenario, id: "cap-advice", capDelta };
    const profiles = scenarioProfiles(input.profiles, activities, scenario);
    return forecastPool({ ...input, profiles }).runOutAtP90;
  };

  const runOutBefore = runOutWith({});
  if (runOutBefore === undefined || lastsUntilRefill(runOutBefore)) {
    return undefined;
  }
  const nowMs = Date.parse(input.now);
  const heaviestFirst = [...input.profiles]
    .sort((a, b) => demandAt(b, nowMs, nowMs).p50 - demandAt(a, nowMs, nowMs).p50)
    .map((profile) => profile.agentId);
  const activityOf = new Map(activities.map((activity) => [activity.agentId, activity]));
  const capDelta: Record<AgentId, number> = {};
  let runOutAfter: string | undefined = runOutBefore;
  while (!lastsUntilRefill(runOutAfter)) {
    const agentId = nextCut(heaviestFirst, activityOf, capDelta, settings);
    if (agentId === undefined) {
      break;
    }
    capDelta[agentId] = (capDelta[agentId] ?? 0) - 1;
    runOutAfter = runOutWith(capDelta);
  }
  return {
    refillAt: refill?.at,
    runOutBefore,
    capDelta,
    runOutAfter,
    enough: lastsUntilRefill(runOutAfter),
  };
}
