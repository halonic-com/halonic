import { type ComponentType, useMemo, useRef } from "react";
import type { ItemRef } from "../points/item-kinds.ts";
import type { ItemPageSectionContribution } from "../points/layout.ts";
import type { Registered } from "../points/point-store.ts";
import { ViewErrorBoundary } from "../view-error-boundary.tsx";
import { LoadedView } from "../view-loading.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";

/**
 * The `step` that asks a section to start adding, as pressing its own add button would, such as
 * the agent map's **Add trigger** asking the Triggers section for its Prompt.
 */
export const SECTION_ADD_STEP = "add";

/**
 * What an item page section's view gets: the item, the context of the feature that added the
 * section, and the step the page asked it for, if any.
 */
export interface ItemPageSectionViewProps {
  readonly item: ItemRef;
  readonly context: WorkspaceContext;
  /**
   * The part of the section the page asked for when it drew it, such as {@link SECTION_ADD_STEP};
   * a section that doesn't know the step shows as it would without one.
   */
  readonly step?: string;
}

/** What `<Sections />` takes. */
export interface SectionsProps {
  /**
   * The id of the one section to draw, for a page that shows each section as a page of its own
   * (see `ItemViewProps.sections`); without it, every section is drawn, in order.
   */
  readonly only?: string;
  /** The step to give the section that `only` names (see {@link ItemPageSectionViewProps.step}). */
  readonly step?: string;
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
): ComponentType<SectionsProps> {
  // `sectionsFor` gives a new array each call, so the component is kept by what the sections are.
  const latest = useRef({ sections, contextFor });
  latest.current = { sections, contextFor };
  const signature = sections.map((section) => `${section.featureId}:${section.id}`).join(" ");
  const { kind, hub, id } = item;
  return useMemo(
    () =>
      function Sections({ only, step }: SectionsProps) {
        const shown = { kind, hub, id };
        const drawn = latest.current.sections.filter(
          (section) => only === undefined || section.id === only,
        );
        return (
          <>
            {drawn.map((section) => (
              <ItemPageSection
                key={section.id}
                section={section}
                item={shown}
                context={latest.current.contextFor(section.featureId)}
                // A step is for the one section asked for, never for every section at once.
                step={only === undefined ? undefined : step}
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
  step,
}: {
  readonly section: Registered<ItemPageSectionContribution>;
  readonly item: ItemRef;
  readonly context: WorkspaceContext;
  readonly step: string | undefined;
}) {
  // The page's own heading names it, so the section's rows say nothing until "Still loading".
  return (
    <ViewErrorBoundary>
      <LoadedView<ItemPageSectionViewProps>
        view={section}
        props={{ item, context, ...(step !== undefined && { step }) }}
      />
    </ViewErrorBoundary>
  );
}
