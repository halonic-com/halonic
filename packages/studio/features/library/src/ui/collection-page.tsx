import { FilterChips, FormRows } from "@halonicjs/studio-kit";
import { ItemGone, type ItemViewProps, PageBackLinkSlot } from "@halonicjs/studio-shell";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { chipText } from "../collection-format.ts";
import { CollectionHostService, type CollectionRef } from "../collection-host.ts";
import { CollectionModel } from "../collection-model.ts";
import { collectionWords } from "../collection-words.ts";
import { sharedHubKey } from "./library-place.tsx";
import { RecordsGrid } from "./records-grid.tsx";
import { UsedByField } from "./used-by-field.tsx";

/** The chip of "All"; a view's chip is its name after `view:`, so a view called "all" is its own chip. */
const allValue = "~all";

function refOf(hub: string, id: string): CollectionRef {
  return { hub: hub === sharedHubKey ? null : hub, id };
}

/**
 * The `collection` item kind's page: the views as chips with their counts and totals, the chosen
 * view's records in a grid, and who uses the collection (flow-library 5.3).
 */
export function CollectionPage({ item, context }: ItemViewProps) {
  const host = context.services.find(CollectionHostService);
  const model = useMemo(
    () => (host === undefined ? undefined : new CollectionModel(host, refOf(item.hub, item.id))),
    [host, item.hub, item.id],
  );
  if (model === undefined) {
    return <Gone context={context} />;
  }
  return (
    <LoadedCollectionPage
      key={`${item.hub ?? ""}/${item.id}`}
      item={item}
      context={context}
      model={model}
    />
  );
}

function Gone({ context }: Pick<ItemViewProps, "context">) {
  return (
    <ItemGone
      kindName={collectionWords.kindName}
      place={collectionWords.place}
      onGoTo={() => context.openPlace?.("library")}
    />
  );
}

function LoadedCollectionPage({
  item,
  context,
  model,
}: Pick<ItemViewProps, "item" | "context"> & { readonly model: CollectionModel }) {
  const subscribe = useCallback((listener: () => void) => model.subscribe(listener), [model]);
  const state = useSyncExternalStore(subscribe, () => model.state);
  const { loaded, gone, name, volatile, view, grid, usage } = state;

  if (gone) {
    return <Gone context={context} />;
  }
  if (!loaded || grid === undefined) {
    return <p className="px-4 py-5 text-small text-fg-muted">{collectionWords.loading}</p>;
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-4 px-4 py-5 wide:px-6">
      <PageBackLinkSlot />
      <h1 tabIndex={-1} className="text-title [overflow-wrap:anywhere]">
        {name || item.id}
      </h1>
      {volatile ? <p className="text-small text-fg-muted">{collectionWords.volatileLine}</p> : null}
      <FilterChips
        label={collectionWords.chipsLabel}
        options={grid.views.map((chip) => ({
          value: chip.view === null ? allValue : `view:${chip.view}`,
          label: chipText(chip),
        }))}
        value={view === null ? allValue : `view:${view}`}
        onChange={(value) =>
          model.chooseView(value === allValue ? null : value.slice("view:".length))
        }
      />
      <RecordsGrid
        label={collectionWords.gridLabel(name || item.id)}
        model={model}
        state={state}
        grid={grid}
      />
      <FormRows>
        <UsedByField usage={usage} notUsed={collectionWords.notUsed} context={context} />
      </FormRows>
    </div>
  );
}
