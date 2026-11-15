import { FilterChips, FormRows, useGridNavigation } from "@halonicjs/studio-kit";
import { ItemGone, type ItemViewProps, PageBackLinkSlot } from "@halonicjs/studio-shell";
import { Fragment, useCallback, useMemo, useSyncExternalStore } from "react";
import { cellText, chipText, headerMarks } from "../collection-format.ts";
import {
  type CollectionColumn,
  CollectionHostService,
  type CollectionRef,
} from "../collection-host.ts";
import { CollectionModel } from "../collection-model.ts";
import { collectionWords } from "../collection-words.ts";
import { sharedHubKey } from "./library-place.tsx";
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
  const { loaded, gone, name, volatile, view, grid, usage } = useSyncExternalStore(
    subscribe,
    () => model.state,
  );

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
        fields={grid.fields}
        rows={grid.rows}
      />
      <FormRows>
        <UsedByField usage={usage} notUsed={collectionWords.notUsed} context={context} />
      </FormRows>
    </div>
  );
}

interface RecordsGridProps {
  readonly label: string;
  readonly fields: readonly CollectionColumn[];
  readonly rows: readonly {
    readonly id: string;
    readonly values: Readonly<Record<string, unknown>>;
  }[];
}

/** A real `grid`: one Tab stop, arrows move between cells (flow-library 5.3, accessibility pass 9.3). */
function RecordsGrid({ label, fields, rows }: RecordsGridProps) {
  const navigation = useGridNavigation(
    rows.map((row) => ({ id: row.id, cells: fields.map(() => true) })),
  );
  return (
    <div className="min-w-0 overflow-x-auto rounded-md border border-border">
      <table
        // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: the ARIA grid pattern on a table, as the kit's List does
        role="grid"
        aria-label={label}
        className="w-full border-collapse"
        {...navigation.gridProps}
      >
        <thead>
          <tr className="border-b border-border bg-surface-subtle text-left text-small font-medium">
            {fields.map((field) => (
              <th key={field.name} scope="col" className="min-w-32 px-3 py-2 font-medium">
                {field.name}
                {headerMarks(field).map(({ mark, hint }) => (
                  <Fragment key={hint}>
                    {" "}
                    <span aria-hidden="true">{mark}</span>
                    <span className="sr-only">{hint}</span>
                  </Fragment>
                ))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border last:border-b-0">
              {fields.map((field, column) => (
                // biome-ignore lint/a11y/useFocusableInteractive: its tabIndex comes from navigation.cell(), which Biome can't see
                <td
                  key={field.name}
                  // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: a cell of the grid above
                  role="gridcell"
                  className={`min-w-32 px-3 py-2 focus-ring [overflow-wrap:anywhere] ${field.computed ? "bg-surface-subtle" : ""}`}
                  {...navigation.cell(row.id, column)}
                >
                  {cellText(field, row.values[field.name])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
