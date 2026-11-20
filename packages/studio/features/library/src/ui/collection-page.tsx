import { Callout, FilterChips, FormRows, settleOnClose } from "@halonicjs/studio-kit";
import {
  engineWordsOf,
  ItemGone,
  type ItemViewProps,
  NameField,
  PageBackLinkSlot,
  useInPhoneTopBar,
} from "@halonicjs/studio-shell";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { chipText } from "../collection-format.ts";
import { CollectionHostService, type CollectionRef } from "../collection-host.ts";
import { CollectionModel } from "../collection-model.ts";
import { collectionWords } from "../collection-words.ts";
import { type ItemTrash, useItemTrash } from "./item-trash.tsx";
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
  const { loaded, failed, failureReason, gone, name, volatile, view, grid, usage } = state;
  const [renameFailed, setRenameFailed] = useState(false);
  const rename = (next: string) => {
    setRenameFailed(false);
    void settleOnClose(model.rename(next).then((written) => setRenameFailed(!written)));
  };
  const trash = useItemTrash(context, {
    kind: "collection",
    hub: item.hub === sharedHubKey ? null : item.hub,
    id: item.id,
    name: name || item.id,
    ...(usage === undefined ? {} : { usage }),
    rename: { kindName: collectionWords.kindName, onRename: rename },
  });

  if (gone) {
    return trash.strip ?? <Gone context={context} />;
  }
  if (failed && !loaded) {
    return (
      <div className="px-4 py-5">
        <Callout
          tone="danger"
          title={collectionWords.couldntLoad}
          action={{ label: collectionWords.tryAgain, onClick: () => model.refresh() }}
        >
          {/* A load that fails without a reason never reached the engine: say that, never nothing. */}
          {failureReason ?? engineWordsOf(context).notAnswering}
        </Callout>
      </div>
    );
  }
  if (!loaded || grid === undefined) {
    return <p className="px-4 py-5 text-small text-fg-muted">{collectionWords.loading(item.id)}</p>;
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-4 px-4 py-5 wide:px-6">
      <PageBackLinkSlot />
      <CollectionTitle name={name || item.id} trash={trash} onRename={rename} />
      {renameFailed ? (
        <p role="alert" className="text-small text-danger">
          {collectionWords.renameFailed}
        </p>
      ) : null}
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

/**
 * The page's title and ⋮. On the desktop the title is the rename field. Under a phone's top bar,
 * which names the collection and holds ⋮ with Rename, the title is for screen readers only and no
 * row is drawn for it, so the page starts with what is under it.
 */
function CollectionTitle({
  name,
  trash,
  onRename,
}: {
  readonly name: string;
  readonly trash: ItemTrash;
  readonly onRename: (name: string) => void;
}) {
  if (useInPhoneTopBar()) {
    return (
      <>
        <h1 ref={trash.titleRef} tabIndex={-1} className={trash.titleClassName}>
          {name}
        </h1>
        {trash.menu}
      </>
    );
  }
  return (
    <div className="flex items-start justify-between gap-2">
      <h1 ref={trash.titleRef} tabIndex={-1} className="flex min-w-0 text-title">
        <NameField name={name} label={collectionWords.nameLabel} onRename={onRename} />
      </h1>
      {trash.menu}
    </div>
  );
}
