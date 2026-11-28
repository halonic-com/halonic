import type { MenuEntry } from "@halonicjs/studio-kit";
import { type ReactNode, useMemo } from "react";
import type { Announcer } from "../announcer/announcer.ts";
import type { PlaceContribution, SidebarViewContribution } from "../points/frame.ts";
import type { KeyboardPlatform } from "../points/keybindings.ts";
import type { Registered } from "../points/point-store.ts";
import type { PlaceOfKind } from "../rail/rail-selection.ts";
import { useWindowRailParts } from "../rail/window-rail.tsx";
import type { Shell } from "../shell.ts";
import type { WorkspaceSwitcherProps } from "../sidebar/workspace-switcher.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";
import { StudioSidebar } from "./studio-sidebar.tsx";
import type { StudioWorkspace } from "./studio-workspace.ts";

/** What {@link useWindowColumn} needs: the window's parts the rail and the list column read. */
export interface WindowColumnOptions {
  readonly contributions: Shell["contributions"];
  readonly workspace: StudioWorkspace;
  readonly placeOfKind: PlaceOfKind;
  /** Home and the places features added: `contributions.places.list()`, the same list each render. */
  readonly places: readonly Registered<PlaceContribution>[];
  readonly announcer: Announcer;
  readonly platform: KeyboardPlatform;
  readonly contextFor: (featureId: string) => WorkspaceContext;
  readonly onSearch: () => void;
  /** Opens Settings, from the rail's Settings button. */
  readonly onSettings: () => void;
  readonly help: readonly MenuEntry[];
  readonly switcher: WorkspaceSwitcherProps | undefined;
  /** The sidebar switch's picked tab and its setter, which the window keeps. */
  readonly view: { readonly selected: string; readonly select: (id: string) => void };
  /** The column's width, its setter and its reset, from `useSidebarWidth().sidebar`. */
  readonly width: {
    readonly width: number;
    readonly onWidthChange: (width: number) => void;
    readonly resetWidth: number;
  };
}

/** The rail and the list column beside it, ready for the frame's `rail` and `sidebar` slots. */
export interface WindowColumn {
  readonly rail: ReactNode;
  readonly sidebar: ReactNode;
}

/**
 * The window's rail and list column (`shell.rail-frame`): the rail with Settings at its bottom,
 * and the sidebar listing the selected entry's places and those no entry holds.
 *
 * @example
 * const column = useWindowColumn({ contributions, workspace, placeOfKind, places, … });
 * <ShellFrame rail={column.rail} sidebar={column.sidebar} … />
 */
export function useWindowColumn(options: WindowColumnOptions): WindowColumn {
  const { contributions, workspace } = options;
  const { tabs } = workspace;
  const rail = useWindowRailParts({
    rail: contributions.rail,
    source: workspace.folderFacts,
    tabs,
    placeOfKind: options.placeOfKind,
    onSettings: options.onSettings,
  });
  const views: readonly Registered<SidebarViewContribution>[] = useMemo(
    () => contributions.sidebarViews.list(),
    [contributions],
  );
  return {
    rail: rail.element,
    sidebar: (
      <StudioSidebar
        places={options.places}
        leftOut={rail.leftOut}
        views={views}
        selectedView={options.view.selected}
        onSelectView={options.view.select}
        tabs={tabs}
        announcer={options.announcer}
        platform={options.platform}
        contextFor={options.contextFor}
        onSearch={options.onSearch}
        help={options.help}
        switcher={options.switcher}
        {...options.width}
        footer={contributions.sidebarFooter.item()}
      />
    ),
  };
}
