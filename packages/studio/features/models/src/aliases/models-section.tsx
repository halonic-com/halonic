import { EmptyState } from "@halonicjs/studio-kit";
import type { ItemPageSectionViewProps } from "@halonicjs/studio-shell";
import { useId } from "react";
import { ModelsFilesService } from "../api.ts";
import { aliasRows } from "./alias-rows.ts";
import {
  ADD_A_PRICE,
  ALIAS_KIND,
  MODELS_HEADING,
  MODELS_LOADING_LINE,
  MODELS_UNREADABLE_REASON,
  MODELS_UNREADABLE_TITLE,
  NO_ALIASES_AFTER_EXAMPLE,
  NO_ALIASES_BEFORE_EXAMPLE,
  NO_ALIASES_EXAMPLE,
  NO_ALIASES_TITLE,
  NO_PRICE_LINE,
  TRY_AGAIN,
} from "./alias-text.ts";
import type { ModelsState } from "./read-models.ts";
import { useModels } from "./use-models.ts";

/**
 * The **Models** section of the workspace page (`models.aliases.list`): the aliases of
 * `models.yaml` by name, each with "provider / model", each opening its alias tab.
 *
 * @example
 * <ModelsSection item={WORKSPACE_PAGE_ITEM} context={context} />
 */
export function ModelsSection({ context }: ItemPageSectionViewProps) {
  const files = context.services.get(ModelsFilesService);
  const [state, retry] = useModels(files);
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="text-heading">
        {MODELS_HEADING}
      </h2>
      <AliasList
        state={state}
        retry={retry}
        open={(name) => context.openItem?.({ kind: ALIAS_KIND, hub: "local", id: name })}
      />
    </section>
  );
}

function AliasList({
  state,
  retry,
  open,
}: {
  readonly state: ModelsState;
  readonly retry: () => void;
  readonly open: (name: string) => void;
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
        action={{ label: TRY_AGAIN, onClick: retry }}
      />
    );
  }
  const rows = aliasRows(state.models);
  if (rows.length === 0) {
    return (
      <EmptyState
        plain
        headingLevel={3}
        title={NO_ALIASES_TITLE}
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
        <li key={row.name} className="flex items-center gap-2">
          <button type="button" className="text-left" onClick={() => open(row.name)}>
            {row.label}
          </button>
          {row.price === undefined ? (
            <>
              <span>· {NO_PRICE_LINE} ·</span>
              <button type="button" onClick={() => open(row.name)}>
                {ADD_A_PRICE}
              </button>
            </>
          ) : (
            <span>· {row.price}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
