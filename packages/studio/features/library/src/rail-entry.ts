import type { RailEntryContribution } from "@halonicjs/studio-shell";

/**
 * Library's entry in the icon rail (`library.rail-entry`): it shows while the folder has items.
 */
export const libraryRailEntry: RailEntryContribution = {
  id: "library",
  label: "Library",
  icon: "library",
  order: 20,
  shows: (facts) => facts.hasItems,
};
