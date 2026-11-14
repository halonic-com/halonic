import { type ComponentType, Suspense, useMemo, useRef } from "react";
import { lazyView } from "../lazy-view.ts";
import type { ItemRef } from "../points/item-kinds.ts";
import type { ItemPageSectionContribution } from "../points/layout.ts";
import type { Registered } from "../points/point-store.ts";
import { ViewErrorBoundary } from "../view-error-boundary.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";

/** What an item page section's view gets: the item and the context of the feature that added the section. */
export interface ItemPageSectionViewProps {
  readonly item: ItemRef;
  readonly context: WorkspaceContext;
}

/**
 * The component an item page places where its sections go
 * (`shell.item-page-sections`). It is the same component for as long as the item's sections and
 * the item stay the same, so a re-render keeps the sections that are drawn.
 */
export function useSectionsComponent(
  item: ItemRef,
  sections: readonly Registered<ItemPageSectionContribution>[],
  contextFor: (featureId: string) => WorkspaceContext,
): ComponentType {
  // `sectionsFor` gives a new array each call, so the component is kept by what the sections are.
  const latest = useRef({ sections, contextFor });
  latest.current = { sections, contextFor };
  const signature = sections.map((section) => `${section.featureId}:${section.id}`).join(" ");
  const { kind, hub, id } = item;
  return useMemo(
    () =>
      function Sections() {
        const shown = { kind, hub, id };
        return (
          <>
            {latest.current.sections.map((section) => (
              <ItemPageSection
                key={section.id}
                section={section}
                item={shown}
                context={latest.current.contextFor(section.featureId)}
              />
            ))}
          </>
        );
      },
    [kind, hub, id, signature],
  );
}

function ItemPageSection({
  section,
  item,
  context,
}: {
  readonly section: Registered<ItemPageSectionContribution>;
  readonly item: ItemRef;
  readonly context: WorkspaceContext;
}) {
  const View = lazyView<ItemPageSectionViewProps>(section);
  return (
    <ViewErrorBoundary>
      <Suspense fallback={null}>
        <View item={item} context={context} />
      </Suspense>
    </ViewErrorBoundary>
  );
}
