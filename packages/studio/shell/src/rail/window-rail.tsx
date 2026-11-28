import { type ReactNode, useCallback, useMemo, useSyncExternalStore } from "react";
import type { Registered } from "../points/point-store.ts";
import {
  type FolderFacts,
  type FolderFactsSource,
  type RailEntry,
  railEntryIds,
  type ShownRailEntryId,
} from "../points/rail.ts";
import type { RailContributions } from "../points/rail-points.ts";
import { currentLocation, type TabSet } from "../tabs/tab-set.ts";
import { IconRail } from "./icon-rail.tsx";
import { type RailColumn, useRailColumn } from "./rail-column.ts";
import { type PlaceOfKind, selectedRailEntry } from "./rail-selection.ts";

/** The rail's width, `--spacing-rail`: the title bar's start reaches over it too. */
export const RAIL_WIDTH = 64;

/**
 * The facts of a folder the app gave none for (`StudioWorkspace.folderFacts`): a workspace project
 * with items, so the rail shows the entries such a folder shows.
 */
export const workspaceProjectFacts: FolderFacts = {
  kind: "workspace-project",
  hasItems: true,
  hasCodeFolderInside: false,
  git: "repository",
  runsRecorded: false,
  waitingCount: 0,
};

/** What {@link useWindowRail} answers: the rail's entries now and the window's selection. */
export interface WindowRail {
  readonly entries: readonly Registered<RailEntry>[];
  /** Every entry the features added, the hidden ones too. */
  readonly every: readonly RailEntry[];
  readonly column: RailColumn;
}

/**
 * The window's rail (`shell.rail-frame`): the entries the open folder's facts show, read again
 * each time the source says they changed, and the selection the rail and the list column share.
 * The entry the active tab is in stays shown even when its rule hides it, so the page you are on
 * never loses its entry.
 */
export function useWindowRail(
  rail: RailContributions,
  source: FolderFactsSource | undefined,
  tabs: TabSet,
  placeOfKind: PlaceOfKind,
): WindowRail {
  const subscribe = useCallback(
    (listener: () => void) => source?.subscribe(listener) ?? noUnsubscribe,
    [source],
  );
  const facts = useSyncExternalStore(subscribe, () => source?.facts ?? workspaceProjectFacts);
  // Every entry asks the rail once per entry, so it is read again only when the facts change.
  const every = useMemo(() => everyEntry(rail, facts), [rail, facts]);
  const kept = selectedRailEntry(every, currentLocation(tabs.active), placeOfKind);
  const entries = rail.shown(facts, kept);
  const column = useRailColumn(entries, tabs, placeOfKind);
  return { entries, every, column };
}

/** What the window needs for its rail. */
export interface WindowRailOptions {
  readonly rail: RailContributions;
  /** The open folder's facts, `StudioWorkspace.folderFacts`. */
  readonly source: FolderFactsSource | undefined;
  readonly tabs: TabSet;
  readonly placeOfKind: PlaceOfKind;
  /** Opens Settings, from the rail's Settings button: the window's `openSettings`. */
  readonly onSettings: () => void;
}

/** The window's rail, ready to place: the rail and what the sidebar beside it lists. */
export interface WindowRailParts {
  /** The `IconRail`, for the frame's `rail` slot. */
  readonly element: ReactNode;
  /** The places other entries hold, which the list column beside the rail leaves out. */
  readonly leftOut: ReadonlySet<string>;
}

/**
 * The rail in the window (`shell.rail-frame`): the entries the folder shows and the selection the
 * rail and the list column share, with Settings at the rail's bottom.
 *
 * @example
 * const rail = useWindowRailParts({ rail: contributions.rail, source: workspace.folderFacts,
 *   tabs, placeOfKind, onSettings: openSettings });
 * <ShellFrame rail={rail.element} sidebar={<StudioSidebar … />} … />
 */
export function useWindowRailParts(options: WindowRailOptions): WindowRailParts {
  const { tabs, placeOfKind } = options;
  const { entries, every, column } = useWindowRail(options.rail, options.source, tabs, placeOfKind);
  return {
    element: (
      <IconRail
        entries={entries}
        tabs={tabs}
        placeOfKind={placeOfKind}
        onSettings={options.onSettings}
        column={column}
      />
    ),
    leftOut: placesOfOtherEntries(every, column.selected),
  };
}

function noUnsubscribe() {}

/**
 * Every entry the features added, whatever their rules say for these facts: each one in turn is
 * kept in the shown list.
 */
function everyEntry(rail: RailContributions, facts: FolderFacts): readonly RailEntry[] {
  const every = new Map<ShownRailEntryId, RailEntry>();
  for (const id of railEntryIds) {
    for (const entry of rail.shown(facts, id)) every.set(entry.id, entry);
  }
  return [...every.values()];
}

/**
 * The places the list column leaves out (`shell.rail-frame`): those another entry holds, shown
 * or hidden for this folder. A place no entry holds always shows, so none is out of reach. With
 * no entry selected, as on the Search page, every place shows.
 */
export function placesOfOtherEntries(
  every: readonly RailEntry[],
  selected: ShownRailEntryId | undefined,
): ReadonlySet<string> {
  if (selected === undefined) return new Set();
  return new Set(every.filter((entry) => entry.id !== selected).flatMap((entry) => entry.holds));
}
