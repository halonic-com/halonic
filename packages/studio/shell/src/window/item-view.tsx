import { type ComponentType, Suspense } from "react";
import { lazyView } from "../lazy-view.ts";
import type { ItemKindContribution, ItemRef } from "../points/item-kinds.ts";
import type { ItemPageSectionContribution } from "../points/layout.ts";
import type { Registered } from "../points/point-store.ts";
import type { WorkspaceContext } from "../workspace-context.ts";
import { useSectionsComponent } from "./item-page-sections.tsx";

/**
 * What an item kind's `open` view gets: the item its tab shows and the context of the feature
 * that added the kind, and `Sections`, which draws the sections other features add to the kind's
 * page (`shell.item-page-sections`). The page decides where `<Sections />` goes; a page without
 * it shows none.
 */
export interface ItemViewProps {
  readonly item: ItemRef;
  readonly context: WorkspaceContext;
  readonly Sections: ComponentType;
}

/**
 * The item a tab's place points at, read from its key `kind/hub/id`, the same as a deep link.
 * The id keeps any further `/`. Home, places and searches give `undefined`.
 */
export function itemOfLocationKey(key: string): ItemRef | undefined {
  const [kind, hub, ...rest] = key.split("/");
  const id = rest.join("/");
  if (kind === undefined || hub === undefined || kind === "" || hub === "" || id === "") {
    return undefined;
  }
  return { kind, hub, id };
}

/** Draws an item with its kind's `open` view, imported the first time a tab shows that kind. */
export function ItemView({
  kind,
  item,
  context,
  sections,
  contextFor,
}: {
  readonly kind: ItemKindContribution;
  readonly item: ItemRef;
  readonly context: WorkspaceContext;
  /** The sections other features add to this kind's page, in order. */
  readonly sections: readonly Registered<ItemPageSectionContribution>[];
  /** The context of the feature that added a section. */
  readonly contextFor: (featureId: string) => WorkspaceContext;
}) {
  const View = lazyView<ItemViewProps>(kind.open);
  const Sections = useSectionsComponent(item, sections, contextFor);
  return (
    <Suspense fallback={null}>
      <View item={item} context={context} Sections={Sections} />
    </Suspense>
  );
}
