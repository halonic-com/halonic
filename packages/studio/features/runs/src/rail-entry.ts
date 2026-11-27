import type { RailEntryContribution } from "@halonicjs/studio-shell";

/**
 * Runs's entry in the icon rail (`runs.rail-entry`): it shows while the folder has items, or while runs are recorded, so past runs stay reachable after their items are deleted.
 */
export const runsRailEntry: RailEntryContribution = {
  id: "runs",
  label: "Runs",
  icon: "runs",
  order: 50,
  holds: ["runs", "run", "run-file"],
  opens: "runs",
  shows: (facts) => facts.hasItems || facts.runsRecorded,
};
