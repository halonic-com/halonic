import { Suspense } from "react";
import { lazyView } from "../lazy-view.ts";
import type { ItemKindContribution, ItemRef } from "../points/item-kinds.ts";
import type { WorkspaceContext } from "../workspace-context.ts";

/**
 * What an item kind's `open` view gets: the item its tab shows and the context of the feature
 * that added the kind.
 */
export interface ItemViewProps {
  readonly item: ItemRef;
  readonly context: WorkspaceContext;
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
}: {
  readonly kind: ItemKindContribution;
  readonly item: ItemRef;
  readonly context: WorkspaceContext;
}) {
  const View = lazyView<ItemViewProps>(kind.open);
  return (
    <Suspense fallback={null}>
      <View item={item} context={context} />
    </Suspense>
  );
}
