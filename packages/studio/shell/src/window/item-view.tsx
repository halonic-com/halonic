import type { ComponentType } from "react";
import type { ItemKindContribution, ItemRef } from "../points/item-kinds.ts";
import type { ItemPageSectionContribution } from "../points/layout.ts";
import type { Registered } from "../points/point-store.ts";
import { LoadedView } from "../view-loading.tsx";
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
  /** The part of the page the item was opened on (`openItem`'s `step`), if it was asked for one. */
  readonly step?: string;
  /** How many times the page was asked for a `step`, so a page that is open can tell it was asked again. */
  readonly asked?: number;
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

/**
 * Draws an item with its kind's `open` view, imported the first time a tab shows that kind, with
 * "Loading _page_" while it loads.
 */
export function ItemView({
  kind,
  name,
  item,
  context,
  sections,
  contextFor,
  step,
  asked,
}: {
  readonly kind: ItemKindContribution;
  /** The page's name, for "Loading _page_" while the view loads: the tab's title. */
  readonly name: string;
  readonly item: ItemRef;
  readonly context: WorkspaceContext;
  /** The sections other features add to this kind's page, in order. */
  readonly sections: readonly Registered<ItemPageSectionContribution>[];
  /** The context of the feature that added a section. */
  readonly contextFor: (featureId: string) => WorkspaceContext;
  /** The part of the page to open on, from the tab's place. */
  readonly step?: string | undefined;
  /** How many times the place was asked for a step, from the tab's place. */
  readonly asked?: number | undefined;
}) {
  const Sections = useSectionsComponent(item, sections, contextFor);
  return (
    <LoadedView<ItemViewProps>
      view={kind.open}
      name={name}
      props={{
        item,
        context,
        Sections,
        ...(step === undefined ? {} : { step }),
        ...(asked === undefined ? {} : { asked }),
      }}
    />
  );
}
