import type { RailEntry, ShownRailEntryId } from "../points/rail.ts";
import type { TabLocation } from "../tabs/tab-set.ts";

/**
 * The rail entry the active tab is in (`shell.rail`): the one that holds the first part of the
 * tab's key, such as Library for `agent/acme/sorter` or `agents`. `undefined` while no entry
 * holds it, as on the Search page, so no entry claims a page that isn't its own.
 */
export function selectedRailEntry(
  entries: readonly RailEntry[],
  location: TabLocation,
): ShownRailEntryId | undefined {
  const [first = ""] = location.key.split("/");
  return entries.find((entry) => entry.holds.includes(first))?.id;
}
