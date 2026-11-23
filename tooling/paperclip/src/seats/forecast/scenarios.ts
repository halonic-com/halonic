/**
 * Scenarios (`seats.forecast`): the same forecast run again with the agents'
 * demand changed, so the board sees what a cap cut, a model switch or a
 * leaner prompt would do to the seats and the pool. Which agents a scenario
 * names comes from the plugin's settings, never from code.
 *
 * A scenario changes only the demand profiles. Seats, readings, placements
 * and fits stay the same, so the difference to "current" is the scenario's
 * effect alone.
 */

import type { DemandProfile } from "./demand.ts";
import { forecastPool, type PoolForecast } from "./pool.ts";
import { forecastSeats, type SeatForecastInput, type SeatForecastRun } from "./seat-forecast.ts";
import type { AgentActivity, AgentId } from "./types.ts";

/** A what-if the board sees each run; which agents it names comes from settings. */
export interface Scenario {
  /** For example `caps-minus-one`, `sonnet-group`, `a1-a2`; never `current`. */
  readonly id: string;
  readonly label: string;
  /** Change to each named agent's concurrent run cap, e.g. -1 for the heavy agents. */
  readonly capDelta: Readonly<Record<AgentId, number>>;
  /** The model each named agent runs on instead (an API model id). */
  readonly modelOverride: Readonly<Record<AgentId, string>>;
  /** Multiplies every agent's demand, e.g. 0.82 for A1 + A2. 1 when unused. */
  readonly demandFactor: number;
}

/** The scenario every run makes: today's caps, models and demand. */
export const currentScenario: Scenario = {
  id: "current",
  label: "Today's caps",
  capDelta: {},
  modelOverride: {},
  demandFactor: 1,
};

/** One run's forecast under one scenario. */
export interface ForecastRun extends SeatForecastRun {
  readonly madeAt: string;
  readonly scenario: string;
  /** The newest fit day the run priced with; undefined with no fits. */
  readonly calibrationDay: string | undefined;
  readonly pool: PoolForecast;
}

/**
 * How much of its demand an agent keeps when its cap changes. A cap only
 * limits the runs the agent has work for (running plus queued), so an agent
 * with less work than its cap loses nothing, and one with more loses the
 * share of runs it can no longer start. An agent with no cap is left as it is.
 */
export function capFactor(activity: AgentActivity | undefined, delta: number): number {
  if (activity?.cap === undefined || delta === 0) {
    return 1;
  }
  const work = activity.runningRuns + activity.queuedRuns;
  const before = Math.min(work, activity.cap);
  const after = Math.min(work, Math.max(0, activity.cap + delta));
  return before > 0 ? after / before : 1;
}

function scaledProfile(profile: DemandProfile, factor: number): DemandProfile {
  if (factor === 1) {
    return profile;
  }
  return {
    ...profile,
    currentRate: profile.currentRate * factor,
    weekProfile: profile.weekProfile.map((tokens) => tokens * factor),
  };
}

/** The agents' demand profiles as the scenario changes them. */
export function scenarioProfiles(
  profiles: readonly DemandProfile[],
  activities: readonly AgentActivity[],
  scenario: Scenario,
): DemandProfile[] {
  const activityOf = new Map(activities.map((activity) => [activity.agentId, activity]));
  return profiles.map((profile) => {
    const delta = scenario.capDelta[profile.agentId] ?? 0;
    const factor = scenario.demandFactor * capFactor(activityOf.get(profile.agentId), delta);
    const model = scenario.modelOverride[profile.agentId] ?? profile.model;
    return scaledProfile({ ...profile, model }, factor);
  });
}

function newestDay(input: SeatForecastInput): string | undefined {
  const days = input.calibrations.map((calibration) => calibration.day).sort();
  return days.at(-1);
}

/** The seat and pool forecast under one scenario. */
export function forecastRun(
  input: SeatForecastInput,
  activities: readonly AgentActivity[],
  scenario: Scenario,
): ForecastRun {
  const scenarioInput: SeatForecastInput = {
    ...input,
    profiles: scenarioProfiles(input.profiles, activities, scenario),
  };
  return {
    madeAt: input.now,
    scenario: scenario.id,
    calibrationDay: newestDay(input),
    ...forecastSeats(scenarioInput),
    pool: forecastPool(scenarioInput),
  };
}

/** "current" first, then every scenario from settings, in their order. */
export function forecastRuns(
  input: SeatForecastInput,
  activities: readonly AgentActivity[],
  scenarios: readonly Scenario[],
): ForecastRun[] {
  const named = scenarios.filter((scenario) => scenario.id !== currentScenario.id);
  return [currentScenario, ...named].map((scenario) => forecastRun(input, activities, scenario));
}
