import { type ComponentType, lazy, Suspense, useMemo } from "react";
import type { BarItemContribution } from "../points/frame.ts";
import type { Registered } from "../points/point-store.ts";
import { loadView } from "../view.ts";
import { ViewErrorBoundary } from "../view-error-boundary.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";

/** What a status bar item's view gets: the context of the feature that added it. */
export interface StatusBarItemProps {
  readonly context: WorkspaceContext;
}

/** Props for {@link StatusBarItems}. */
export interface StatusBarItemsProps {
  /** The items features added, in order: `shell.contributions.statusBar.list()`. */
  readonly items: readonly Registered<BarItemContribution>[];
  /** The context for a feature's item: `shell.services.contextFor(featureId, workspace)`. */
  readonly contextFor: (featureId: string) => WorkspaceContext;
}

/**
 * The status bar's items, such as spend and the branch, in their order. The status bar shows state
 * only, never a result: results are toasts (microcopy 1.3). It isn't a live region either; an item
 * whose change matters announces it once through the announcer (a11y 1.1). With no items it is
 * empty: nothing stands in for a feature that hasn't landed. An item whose view fails to load or
 * draw shows nothing either, and the other items stay.
 *
 * @example
 * <ShellFrame statusBar={<StatusBarItems items={shell.contributions.statusBar.list()} contextFor={contextFor} />} …>
 */
export function StatusBarItems({ items, contextFor }: StatusBarItemsProps) {
  return items.map((item) => (
    <StatusBarItem key={item.id} item={item} context={contextFor(item.featureId)} />
  ));
}

function StatusBarItem({
  item,
  context,
}: {
  readonly item: Registered<BarItemContribution>;
  readonly context: WorkspaceContext;
}) {
  const ItemView = useItemView(item);
  return (
    // Without a fallback, a failed item shows nothing: nothing stands in for it (UX section 0).
    <ViewErrorBoundary>
      <Suspense fallback={null}>
        <ItemView context={context} />
      </Suspense>
    </ViewErrorBoundary>
  );
}

/** The item's view, imported the first time the status bar shows; one import per item. */
function useItemView(item: BarItemContribution): ComponentType<StatusBarItemProps> {
  return useMemo(
    () =>
      lazy(async () => ({
        default: await loadView<ComponentType<StatusBarItemProps>>(item),
      })),
    [item],
  );
}
