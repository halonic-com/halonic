import { type ComponentType, lazy, Suspense, useMemo } from "react";
import type { ItemKindContribution, ItemRef } from "../points/item-kinds.ts";
import { loadView } from "../view.ts";
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
  if (kind === undefined || hub === undefined || kind === "" || id === "") {
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
  const View = useItemView(kind);
  return (
    <Suspense fallback={null}>
      <View item={item} context={context} />
    </Suspense>
  );
}

/** The kind's view; one import per kind. */
function useItemView(kind: ItemKindContribution): ComponentType<ItemViewProps> {
  return useMemo(
    () =>
      lazy(async () => ({
        default: await loadView<ComponentType<ItemViewProps>>(kind.open),
      })),
    [kind],
  );
}
