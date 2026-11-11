import { useCallback, useId, useState, useSyncExternalStore } from "react";
import type { Announcer } from "../announcer/announcer.ts";
import { type PlaceContribution, showPlace } from "../points/frame.ts";
import type { KeyboardPlatform } from "../points/keybindings.ts";
import type { Registered } from "../points/point-store.ts";
import { PlacesList } from "../sidebar/places-list.tsx";
import { SidebarResizeEdge } from "../sidebar/sidebar-resize-edge.tsx";
import { SidebarSearch } from "../sidebar/sidebar-search.tsx";
import { SIDEBAR_DEFAULT_WIDTH } from "../sidebar/sidebar-width.ts";
import { WorkspaceSwitcher, type WorkspaceSwitcherProps } from "../sidebar/workspace-switcher.tsx";
import type { TabSet } from "../tabs/tab-set.ts";
import type { WorkspaceContext } from "../workspace-context.ts";

/** Props for {@link StudioSidebar}. */
export interface StudioSidebarProps {
  /** Home and the places features added, in the sidebar's order: `shell.contributions.places.list()`. */
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
 * A place's signal is read again each time the tabs change.
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
  const places = props.places.map((place) =>
    showPlace(place.id, place.signal?.(contextFor(place.featureId))),
  );

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
