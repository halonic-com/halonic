import type { RailEntryContribution } from "@halonicjs/studio-shell";

/**
 * Inbox's entry in the icon rail (`inbox.rail-entry`): it shows while the folder has items, or while an Inbox item waits, so a waiting question is never hidden.
 */
export const inboxRailEntry: RailEntryContribution = {
  id: "inbox",
  label: "Inbox",
  icon: "inbox",
  order: 40,
  holds: ["inbox"],
  opens: "inbox",
  shows: (facts) => facts.hasItems || facts.waitingCount > 0,
};
