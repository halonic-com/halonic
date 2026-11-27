import type { RailEntryContribution } from "@halonicjs/studio-shell";

/**
 * Messenger's entry in the icon rail (`messenger.rail-entry`): it shows while the folder has items, together with Library, Inbox and Runs.
 */
export const messengerRailEntry: RailEntryContribution = {
  id: "messenger",
  label: "Messenger",
  icon: "messenger",
  order: 30,
  shows: (facts) => facts.hasItems,
};
