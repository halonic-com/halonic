import type { PlaceContribution, PlaceSlotProps } from "../points/frame.ts";
import type { Registered } from "../points/point-store.ts";
import type { TabSet } from "../tabs/tab-set.ts";
import { LoadedView } from "../view-loading.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";
import { usePlaceOpenItem } from "./place-open-items.ts";

/** A place that brings its own list column. */
export type PlaceWithList = Registered<PlaceContribution> & {
  readonly listColumn: NonNullable<PlaceContribution["listColumn"]>;
};

/**
 * The place with a list column that the page at `locationKey` belongs to: its own page (`changes`)
 * or one of its sub-pages (`changes/…`). `undefined` for any other page, or a place without one.
 */
export function placeWithListAt(
  places: readonly Registered<PlaceContribution>[],
  locationKey: string,
): PlaceWithList | undefined {
  for (const place of places) {
    const listColumn = place.listColumn;
    const at = locationKey === place.id || locationKey.startsWith(`${place.id}/`);
    if (at && listColumn !== undefined) return { ...place, listColumn };
  }
  return undefined;
}

/** Props for {@link PlaceListColumn}. */
export interface PlaceListColumnProps {
  readonly place: PlaceWithList;
  readonly tabs: TabSet;
  /** The active tab, whose open item the list shares with the page. */
  readonly tabId: string;
  /** The context of the feature that added the place. */
  readonly context: WorkspaceContext;
}

/**
 * The place's own list in the window's list column (`shell.rail-frame`), in place of the places.
 * It shares the active tab's open item with the place's page, so a row picked here opens there.
 * It says nothing while it loads: the page beside it names the place.
 */
export function PlaceListColumn({ place, tabs, tabId, context }: PlaceListColumnProps) {
  const { open, setOpen } = usePlaceOpenItem(tabs, tabId, place.id);
  return (
    <div data-place-list={place.id} className="flex min-h-0 flex-1 flex-col">
      <LoadedView<PlaceSlotProps>
        key={place.id}
        view={place.listColumn}
        props={{ context, open, setOpen }}
      />
    </div>
  );
}
