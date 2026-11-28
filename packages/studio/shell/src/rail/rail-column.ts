import { useCallback, useState, useSyncExternalStore } from "react";
import type { RailEntry, ShownRailEntryId } from "../points/rail.ts";
import { currentLocation, type TabSet } from "../tabs/tab-set.ts";
import { type PlaceOfKind, selectedRailEntry } from "./rail-selection.ts";

/** A click on a rail entry, remembered with the entry the active tab was in at the time. */
export interface RailPick {
  readonly picked: ShownRailEntryId;
  readonly tabEntry: ShownRailEntryId | undefined;
}

/**
 * The entry the rail shows selected, and whose places the list column lists (`shell.rail-frame`).
 * A click picks an entry, so one with no page of its own yet, such as Messenger, still shows its
 * places beside the rail. The pick holds until the active tab moves to another entry: a tab click,
 * Back or a link then selects the entry that holds the new page, as without a pick.
 */
export function railColumnEntry(
  pick: RailPick | undefined,
  tabEntry: ShownRailEntryId | undefined,
): ShownRailEntryId | undefined {
  if (pick !== undefined && pick.tabEntry === tabEntry) return pick.picked;
  return tabEntry;
}

/** What {@link useRailColumn} answers: the selected entry and the way to pick one. */
export interface RailColumn {
  readonly selected: ShownRailEntryId | undefined;
  /** Picks the entry; the window's tab stays as it is until the rail opens the entry's page. */
  pick(entry: RailEntry): void;
}

/**
 * The window's rail selection, for the rail and the list column alike. It follows the active tab
 * through `tabs.subscribe`, and a click on an entry through `pick`.
 *
 * @example
 * const column = useRailColumn(entries, workspace.tabs, placeOfKind);
 * <IconRail entries={entries} tabs={workspace.tabs} placeOfKind={placeOfKind} column={column} />
 */
export function useRailColumn(
  entries: readonly RailEntry[],
  tabs: TabSet,
  placeOfKind: PlaceOfKind,
): RailColumn {
  const subscribe = useCallback((listener: () => void) => tabs.subscribe(listener), [tabs]);
  useSyncExternalStore(subscribe, () => tabs.state);
  const [pick, setPick] = useState<RailPick | undefined>(undefined);
  const tabEntry = selectedRailEntry(entries, currentLocation(tabs.active), placeOfKind);
  return {
    selected: railColumnEntry(pick, tabEntry),
    pick: (entry) => {
      // Opening the entry's page moves the tab into the entry, which selects it without a pick.
      const after = entry.opens === undefined ? tabEntry : entry.id;
      setPick({ picked: entry.id, tabEntry: after });
    },
  };
}
