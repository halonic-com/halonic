import { Button, EmptyState, inlineLinkClasses } from "@halonicjs/studio-kit";
import type { ItemPageSectionViewProps } from "@halonicjs/studio-shell";
import { useId, useRef, useState } from "react";
import { ModelsFilesService } from "../api.ts";
import { BudgetBlock } from "../budget/budget-block.tsx";
import { type AliasRow, aliasRows, providerChoiceLabel } from "./alias-rows.ts";
import {
  ADD_A_PRICE,
  ALIAS_KIND,
  addPriceLabel,
  MODELS_HEADING,
  MODELS_LOADING_LINE,
  MODELS_UNREADABLE_REASON,
  MODELS_UNREADABLE_TITLE,
  NEW_ALIAS,
  NO_ALIASES_AFTER_EXAMPLE,
  NO_ALIASES_BEFORE_EXAMPLE,
  NO_ALIASES_EXAMPLE,
  NO_ALIASES_TITLE,
  NO_PRICE_LINE,
  RUNS_LOCALLY_LINE,
  TRY_AGAIN,
} from "./alias-text.ts";
import { NewAliasDialog } from "./new-alias-dialog.tsx";
import type { ModelsState } from "./read-models.ts";
import { useModels } from "./use-models.ts";

/**
 * The **Models** section of the workspace page (`models.aliases.list`): the aliases of
 * `models.yaml` by name, each with "provider / model", each opening its alias tab. The list sits
 * right under the heading, before the Budget, so no alias reads as part of the budget (HAL-14204).
 * Each row is drawn as an inline link, so it shows it can be pressed and gets Studio's focus ring.
 *
 * @example
 * <ModelsSection item={WORKSPACE_PAGE_ITEM} context={context} />
 */
export function ModelsSection({ context }: ItemPageSectionViewProps) {
  const files = context.services.get(ModelsFilesService);
  const heading = useRef<HTMLHeadingElement>(null);
  const [state, retry, retrying] = useModels(files, () => heading.current?.focus());
  const [creating, setCreating] = useState(false);
  const newButton = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  const open = (name: string) => context.openItem?.({ kind: ALIAS_KIND, hub: "local", id: name });
  return (
    <section
      aria-labelledby={headingId}
      data-workspace-section="models"
      className="flex flex-col gap-2"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 ref={heading} id={headingId} tabIndex={-1} className="text-heading">
          {MODELS_HEADING}
        </h2>
        <Button ref={newButton} variant="secondary" onClick={() => setCreating(true)}>
          {NEW_ALIAS}
        </Button>
      </div>
      <AliasList
        state={state}
        retry={retry}
        retrying={retrying}
        open={open}
        create={() => setCreating(true)}
      />
      <BudgetBlock files={files} state={state} />
      {creating ? (
        <NewAliasDialog
          files={files}
          providers={providersOf(state)}
          labels={providerLabels(state)}
          returnFocus={() => newButton.current}
          onCancel={() => setCreating(false)}
          onCreated={(name) => {
            setCreating(false);
            open(name);
          }}
        />
      ) : null}
    </section>
  );
}

/** The providers to pick from: those the aliases use, then the others that have a file. */
function providersOf(state: ModelsState): string[] {
  if (state.status !== "ready") return [];
  const used = Object.values(state.models.aliases).map((alias) => alias.provider);
  return [...new Set([...used, ...state.providers.map(({ id }) => id)])];
}

function AliasList({
  state,
  retry,
  retrying,
  open,
  create,
}: {
  readonly state: ModelsState;
  readonly retry: () => void;
  readonly retrying: boolean;
  readonly open: (name: string) => void;
  readonly create: () => void;
}) {
  if (state.status === "loading") return <p role="status">{MODELS_LOADING_LINE}</p>;
  if (state.status === "unreadable") {
    return (
      <EmptyState
        tone="error"
        align="start"
        headingLevel={3}
        title={MODELS_UNREADABLE_TITLE}
        description={MODELS_UNREADABLE_REASON}
        action={{ label: TRY_AGAIN, onClick: retry, busy: retrying }}
      />
    );
  }
  const rows = aliasRows(state.models, state);
  if (rows.length === 0) {
    return (
      <EmptyState
        plain
        headingLevel={3}
        title={NO_ALIASES_TITLE}
        action={{ label: NEW_ALIAS, onClick: create }}
        description={
          <>
            {NO_ALIASES_BEFORE_EXAMPLE}
            <code>{NO_ALIASES_EXAMPLE}</code>
            {NO_ALIASES_AFTER_EXAMPLE}
          </>
        }
      />
    );
  }
  return (
    <ul className="flex flex-col">
      {rows.map((row) => (
        <li key={row.name} className="flex flex-wrap items-center gap-x-2">
          <button
            type="button"
            className={`text-left ${inlineLinkClasses}`}
            onClick={() => open(row.name)}
          >
            {row.label}
          </button>
          <RowPrice row={row} open={open} />
        </li>
      ))}
    </ul>
  );
}

function RowPrice({
  row,
  open,
}: {
  readonly row: AliasRow;
  readonly open: (name: string) => void;
}) {
  if (row.price !== undefined) return <span>· {row.price}</span>;
  if (row.runsLocally) return <span>· {RUNS_LOCALLY_LINE}</span>;
  return (
    <>
      <span>· {NO_PRICE_LINE} ·</span>
      <button
        type="button"
        className={inlineLinkClasses}
        aria-label={addPriceLabel(row.name)}
        onClick={() => open(row.name)}
      >
        {ADD_A_PRICE}
      </button>
    </>
  );
}

/** What the provider list calls each provider that has a file, by id; the saved value stays the id. */
function providerLabels(state: ModelsState): ReadonlyMap<string, string> {
  return new Map(
    state.status === "ready"
      ? state.providers.map((provider) => [provider.id, providerChoiceLabel(provider)])
      : [],
  );
}
