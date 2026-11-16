import { TabList, TabPanel, useTabIds } from "@halonicjs/studio-kit";
import { type ComponentType, Suspense, useMemo, useState } from "react";
import { lazyView } from "../lazy-view.ts";
import type { SidebarViewContribution } from "../points/frame.ts";
import type { Registered } from "../points/point-store.ts";
import type { WorkspaceContext } from "../workspace-context.ts";

const studioTab = "studio";

/** What the sidebar below the switch shows: the places, or one feature's view. */
export interface SidebarViewsProps {
  /** The views features added, in order: `shell.contributions.sidebarViews.list()`. */
  readonly views: readonly Registered<SidebarViewContribution>[];
  /** The context for a view: `shell.services.contextFor(featureId, workspace)`. */
  readonly contextFor: (featureId: string) => WorkspaceContext;
  /** The Studio side: the places and the Settings row. */
  readonly places: React.ReactNode;
  /** The Settings row, kept under a view too. */
  readonly settings: React.ReactNode;
}

/**
 * The switch between the Studio's places and the views features added, such as the file tree
 * (requirement `shell.sidebar-switch`). Without a view, only the places show and there is no switch.
 *
 * @example
 * <SidebarViews views={contributions.sidebarViews.list()} contextFor={contextFor}
 *   places={<PlacesList … />} settings={<SettingsRow … />} />
 */
export function SidebarViews({ views, contextFor, places, settings }: SidebarViewsProps) {
  const ids = useTabIds();
  const [selected, setSelected] = useState<string>(studioTab);
  const tabs = useMemo(
    () => [
      { id: studioTab, label: "Studio" },
      ...views.map((view) => ({ id: view.id, label: view.label })),
    ],
    [views],
  );
  if (views.length === 0) return places;
  const shown = views.find((view) => view.id === selected);
  return (
    <>
      <TabList
        label="Sidebar view"
        tabs={tabs}
        selected={shown?.id ?? studioTab}
        onSelect={setSelected}
        ids={ids}
      />
      <TabPanel ids={ids} tabs={tabs} selected={shown?.id ?? studioTab}>
        {shown === undefined ? (
          places
        ) : (
          <>
            <SidebarView view={shown} context={contextFor(shown.featureId)} />
            {settings}
          </>
        )}
      </TabPanel>
    </>
  );
}

function SidebarView({
  view,
  context,
}: {
  readonly view: Registered<SidebarViewContribution>;
  readonly context: WorkspaceContext;
}) {
  const View = lazyView<{ readonly context: WorkspaceContext }>(view) as ComponentType<{
    readonly context: WorkspaceContext;
  }>;
  return (
    <Suspense fallback={null}>
      <View context={context} />
    </Suspense>
  );
}
