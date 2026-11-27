import type { RailEntryContribution } from "@halonicjs/studio-shell";

/**
 * Changes's entry in the icon rail (`source-control.rail-entry`): it shows for every folder,
 * whatever its git state, since its page is where history is turned on or explained.
 */
export const changesRailEntry: RailEntryContribution = {
  id: "changes",
  label: "Changes",
  icon: "changes",
  order: 60,
  // Pull requests is a section of Changes' list (HAL-20673 rail flows, line 2a).
  holds: ["changes", "pull-requests"],
  opens: "changes",
  shows: () => true,
};
