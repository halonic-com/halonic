import type { RailEntryContribution } from "@halonicjs/studio-shell";

/**
 * Library's entry in the icon rail (`library.rail-entry`): it shows while the folder has items.
 */
export const libraryRailEntry: RailEntryContribution = {
  id: "library",
  label: "Library",
  icon: "library",
  order: 20,
  // Agents, Workflows and Routines are sections of Library's list (HAL-20673 rail flows, line 2a).
  holds: [
    "library",
    "agents",
    "workflows",
    "routines",
    "agent",
    "workflow",
    "routine",
    "skill",
    "knowledge",
    "collection",
    "connector",
  ],
  opens: "library",
  shows: (facts) => facts.hasItems,
};
