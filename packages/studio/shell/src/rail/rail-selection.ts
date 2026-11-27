import type { RailEntry, ShownRailEntryId } from "../points/rail.ts";
import type { TabLocation } from "../tabs/tab-set.ts";

/** The place an item kind registers, such as `agents` for `agent`, or `undefined` for none. */
export type PlaceOfKind = (kind: string) => string | undefined;

/**
 * The rail entry the active tab is in (`shell.rail`). A tab's key starts with a place, such as
 * `agents`, or an item kind, such as `agent` in `agent/acme/sorter`; a kind counts as the place
 * it registers. `undefined` while no entry holds it, as on the Search page, so no entry claims a
 * page that isn't its own.
 */
export function selectedRailEntry(
  entries: readonly RailEntry[],
  location: TabLocation,
  placeOfKind: PlaceOfKind,
): ShownRailEntryId | undefined {
  const [first = ""] = location.key.split("/");
  const place = placeOfKind(first) ?? first;
  return entries.find((entry) => entry.holds.includes(place))?.id;
}
