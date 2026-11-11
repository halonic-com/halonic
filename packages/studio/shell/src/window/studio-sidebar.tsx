import { useCallback, useEffect, useId, useReducer, useState, useSyncExternalStore } from "react";
import type { Announcer } from "../announcer/announcer.ts";
import type { PlaceContribution } from "../points/frame.ts";
import type { KeyboardPlatform } from "../points/keybindings.ts";
import type { Registered } from "../points/point-store.ts";
import { PlacesList } from "../sidebar/places-list.tsx";
import { SidebarResizeEdge } from "../sidebar/sidebar-resize-edge.tsx";
import { SidebarSearch } from "../sidebar/sidebar-search.tsx";
import { SIDEBAR_DEFAULT_WIDTH } from "../sidebar/sidebar-width.ts";
import { WorkspaceSwitcher, type WorkspaceSwitcherProps } from "../sidebar/workspace-switcher.tsx";
import type { TabSet } from "../tabs/tab-set.ts";
import type { WorkspaceContext } from "../workspace-context.ts";
import { shownPlaces } from "./shown-places.ts";

/** Props for {@link StudioSidebar}. */
export interface StudioSidebarProps {
  /**
   * Home and the places features added, in the sidebar's order: `shell.contributions.places.list()`.
   * Pass the same list each render (it doesn't change once the shell has started), or the
   * sidebar subscribes to the signals again each time.
   */
  readonly places: readonly Registered<PlaceContribution>[];
  readonly tabs: TabSet;
  readonly announcer: Announcer;
  readonly platform: KeyboardPlatform;
  /** The context for a place's signal: `shell.services.contextFor(featureId, workspace)`. */
  readonly contextFor: (featureId: string) => WorkspaceContext;
  /** Opens the Ctrl K palette. */
  readonly onSearch: () => void;
  /** The workspace switcher, once the app has a workspace menu (T3); without it, none shows. */
  readonly switcher?: WorkspaceSwitcherProps | undefined;
}

/**
 * The desktop sidebar (component specs 24.4): the workspace switcher, the Search box, then the
 * places, followed by its resize edge. It starts 264px wide and keeps the width the edge sets while
 * the window is open. In a narrow window the frame puts it in the Places drawer, which sets its
 * width, and the edge hides itself.
 *
 * A place's signal is read again each time the tabs change, and each time its place says it
 * changed through `subscribeSignal`.
 *
 * @example
 * <StudioSidebar places={shell.contributions.places.list()} tabs={workspace.tabs}
 *   announcer={shell.announcer} platform={platform} contextFor={contextFor} onSearch={palette.show} />
 */
export function StudioSidebar(props: StudioSidebarProps) {
  const { tabs, contextFor } = props;
  const sidebarId = useId();
  const [width, setWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  useSyncExternalStore(
    useCallback((listener) => tabs.subscribe(listener), [tabs]),
    () => tabs.state,
  );
  useSignalChanges(props.places, contextFor);
  const places = shownPlaces(props.places, contextFor);

  return (
    <>
      <div
        id={sidebarId}
        style={{ width }}
        className="flex shrink-0 flex-col gap-2 overflow-y-auto border-e border-border bg-surface-subtle p-2"
      >
        {props.switcher === undefined ? null : <WorkspaceSwitcher {...props.switcher} />}
        <SidebarSearch platform={props.platform} onOpen={props.onSearch} />
        <PlacesList places={places} tabs={tabs} announcer={props.announcer} />
      </div>
      <SidebarResizeEdge
        width={width}
        sidebarId={sidebarId}
        onResize={setWidth}
        onResizeEnd={setWidth}
      />
    </>
  );
}

/**
 * Draws the sidebar again whenever a place says its signal changed, so a count or the running dot
 * is current without waiting for the tabs to change. Stops listening when the places change or
 * the sidebar goes away.
 */
function useSignalChanges(
  places: readonly Registered<PlaceContribution>[],
  contextFor: (featureId: string) => WorkspaceContext,
): void {
  const [, signalChanged] = useReducer((changes: number) => changes + 1, 0);
  useEffect(() => {
    const stops = places.flatMap((place) =>
      place.subscribeSignal === undefined
        ? []
        : [place.subscribeSignal(contextFor(place.featureId), signalChanged)],
    );
    return () => {
      for (const stop of stops) {
        stop();
      }
    };
  }, [places, contextFor]);
}
