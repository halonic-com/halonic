import type { RailEntryContribution } from "@halonicjs/studio-shell";

/**
 * Messenger's entry in the icon rail (`messenger.rail-entry`): it shows while the folder has items,
 * together with Library, Inbox and Runs.
 */
export const messengerRailEntry: RailEntryContribution = {
  id: "messenger",
  label: "Messenger",
  icon: "messenger",
  order: 30,
  // Team's places are Messenger's list (HAL-20673 rail flows, line 2a).
  holds: ["messenger", "overview", "team"],
  // Messenger's page comes with its rebuild (P4); until then the entry opens nothing.
  opens: undefined,
  shows: (facts) => facts.hasItems,
};
