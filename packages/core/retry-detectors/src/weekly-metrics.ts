import type { DecisionEntry, OutcomeKnown, ShipChosen } from "./decision-log.ts";

/** Pass and rework counts for the tasks shipped in one week. */
export interface WeekMetrics {
  /** The Monday the week starts on (UTC), as `YYYY-MM-DD`. */
  readonly week: string;
  /** Tasks with a ship choice this week. */
  readonly tasks: number;
  /** Tasks that shipped an open-model attempt. */
  readonly shipped: number;
  /** Tasks that shipped nothing and went back to Opus. */
  readonly fallbacks: number;
  /** Shipped tasks whose change merged as written. */
  readonly passes: number;
  /** Shipped tasks whose change needed rework. */
  readonly reworks: number;
  /** Shipped tasks with no outcome yet. */
  readonly pending: number;
  /** Attempts per task, on average. */
  readonly meanAttempts: number;
  /** Seconds from first start to ship choice, on average. */
  readonly meanWaitSeconds: number;
  /** Spend on all attempts this week, in US dollars. */
  readonly costUsd: number;
}

/**
 * Pass and rework counts per week, from a decision log. A task counts in the
 * week of its ship choice, even when its outcome is known later; its latest
 * outcome entry wins. Weeks come out oldest first.
 */
export function weeklyMetrics(entries: readonly DecisionEntry[]): WeekMetrics[] {
  const ships = new Map<string, ShipChosen>();
  const outcomes = new Map<string, OutcomeKnown>();
  for (const entry of entries) {
    if (entry.kind === "ship") ships.set(entry.taskId, entry);
    if (entry.kind === "outcome") outcomes.set(entry.taskId, entry);
  }
  const byWeek = new Map<string, ShipChosen[]>();
  for (const ship of ships.values()) {
    const week = weekStart(ship.at);
    byWeek.set(week, [...(byWeek.get(week) ?? []), ship]);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, weekShips]) => summarize(week, weekShips, outcomes));
}

function summarize(
  week: string,
  ships: readonly ShipChosen[],
  outcomes: ReadonlyMap<string, OutcomeKnown>,
): WeekMetrics {
  const shipped = ships.filter((ship) => ship.attempt !== null);
  const outcomeOf = (ship: ShipChosen) => outcomes.get(ship.taskId)?.outcome;
  return {
    week,
    tasks: ships.length,
    shipped: shipped.length,
    fallbacks: ships.length - shipped.length,
    passes: shipped.filter((ship) => outcomeOf(ship) === "pass").length,
    reworks: shipped.filter((ship) => outcomeOf(ship) === "rework").length,
    pending: shipped.filter((ship) => outcomeOf(ship) === undefined).length,
    meanAttempts: mean(ships.map((ship) => ship.attempts)),
    meanWaitSeconds: mean(ships.map((ship) => ship.waitSeconds)),
    costUsd: sum(ships.map((ship) => ship.costUsd)),
  };
}

const dayMs = 24 * 60 * 60 * 1000;

/** The Monday (UTC) of the week that `iso` falls in, as `YYYY-MM-DD`. */
export function weekStart(iso: string): string {
  const day = new Date(iso);
  const daysSinceMonday = (day.getUTCDay() + 6) % 7;
  const monday = new Date(day.getTime() - daysSinceMonday * dayMs);
  return monday.toISOString().slice(0, 10);
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}
