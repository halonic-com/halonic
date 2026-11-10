import { PlaceIcon, StatusChip } from "@halonicjs/studio-kit";
import { useCallback, useSyncExternalStore } from "react";
import type { Announcer } from "../announcer/announcer.ts";
import type { PlaceSignal, ShownPlace } from "../points/frame.ts";
import { usePageHeadingFocus } from "../tabs/history-moves.ts";
import { LocationLink } from "../tabs/location-link.tsx";
import { openLocation } from "../tabs/open-location.ts";
import { currentLocation, type TabLocation, type TabSet } from "../tabs/tab-set.ts";

/** Props for {@link PlacesList}. */
export interface PlacesListProps {
  /** The places to show, in the sidebar's order, from `showPlace` (only the ones added). */
  readonly places: readonly ShownPlace[];
  /** The open workspace's tabs: a pick opens there, and the active tab says where you are. */
  readonly tabs: TabSet;
  /** The window's announcer, for "Opened … in a new tab." after a Ctrl-click. */
  readonly announcer: Announcer;
  /**
   * The places above a tab's place, outermost first, as the toolbar's path shows them. An item's
   * place is the first of them: on the workflow "Support reply", you are in Workflows.
   */
  readonly parentsOf?: ((location: TabLocation) => readonly TabLocation[]) | undefined;
}

/**
 * The sidebar's places (component specs 24.4, UX 1.3): a `nav` named "Places" with one link per
 * place the features added, in the fixed order. Where you are shows the filled icon in `accent`
 * on the halo tint, and is `aria-current="page"`; the others show the outline in `fg-muted`. A
 * signal shows after the name: a count, or the still running dot, and a screen reader hears it
 * after the name ("Inbox, 2 waiting").
 *
 * A click opens the place in the active tab and moves focus to the page's `h1`. A Ctrl-click or a
 * middle-click opens it in a new tab next to it and says so, as the toolbar's path does.
 *
 * @example
 * <PlacesList places={shownPlaces} tabs={workspace.tabs} announcer={shell.announcer} />
 */
export function PlacesList({ places, tabs, announcer, parentsOf }: PlacesListProps) {
  // One `subscribe` per tab set, so React doesn't subscribe again on every render.
  const subscribe = useCallback((listener: () => void) => tabs.subscribe(listener), [tabs]);
  useSyncExternalStore(subscribe, () => tabs.state);
  const focusNewPage = usePageHeadingFocus();
  const here = placeOf(currentLocation(tabs.active), parentsOf);

  const open = (location: TabLocation, inNewTab: boolean) => {
    openLocation(tabs, announcer, location, inNewTab);
    if (!inNewTab) {
      focusNewPage();
    }
  };

  return (
    <nav aria-label="Places">
      <ul className="flex flex-col gap-0.5">
        {places.map((place) => {
          const current = place.id === here;
          return (
            <li key={place.id}>
              <LocationLink
                location={{ key: place.id, title: place.label }}
                onOpen={open}
                current={current}
                className={current ? placeClasses.current : placeClasses.other}
              >
                <span className={iconClasses(current)}>
                  {/* The kit names each place icon by the place's key, as `placeNames` does. */}
                  <PlaceIcon name={place.id} filled={current} />
                </span>
                <span className="min-w-0 flex-1 truncate">{place.label}</span>
                {place.signal === undefined ? null : <Signal signal={place.signal} />}
              </LocationLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The place the user is in: an item's outermost parent, or the place itself. */
function placeOf(location: TabLocation, parentsOf: PlacesListProps["parentsOf"]): string {
  return parentsOf?.(location)[0]?.key ?? location.key;
}

/** A place's signal after its name. Its words are read after the name; the mark isn't. */
function Signal({ signal }: { readonly signal: PlaceSignal }) {
  if (signal.mark === "count") {
    return (
      <StatusChip tone="accent" shape="count" name={signal.spoken}>
        {signal.value}
      </StatusChip>
    );
  }
  return (
    <>
      {/* Still, never breathing (UX settled values). In forced colours it keeps its fill. */}
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 rounded-full bg-running forced-color-adjust-none forced-colors:bg-[CanvasText]"
      />
      <span className="sr-only">, {signal.spoken}</span>
    </>
  );
}

// A 32px row with the 20px icon, 8px between icon and name (kit README, component specs 24.4).
const placeBase =
  "flex h-control-md min-w-0 items-center gap-2 rounded-sm px-2 text-body focus-ring-inset";

const placeClasses = {
  // In forced colours the tint is gone, so a 2px `Highlight` bar at the start marks where you are.
  current: [
    placeBase,
    "bg-halo-tint text-fg",
    "forced-colors:border-s-2 forced-colors:border-[Highlight]",
  ].join(" "),
  other: [placeBase, "text-fg-muted hover:bg-surface-muted hover:text-fg"].join(" "),
} as const;

function iconClasses(current: boolean): string {
  const colour = current ? "text-accent forced-colors:text-[CanvasText]" : "text-fg-muted";
  return `size-icon-md shrink-0 *:size-full ${colour}`;
}
