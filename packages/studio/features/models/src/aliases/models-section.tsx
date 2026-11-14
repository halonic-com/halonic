import type { ItemPageSectionViewProps } from "@halonicjs/studio-shell";
import { useId } from "react";
import { ModelsFilesService } from "../api.ts";
import { aliasRows } from "./alias-rows.ts";
import {
  ALIAS_KIND,
  MODELS_HEADING,
  MODELS_UNREADABLE_LINE,
  NO_ALIASES_LINE,
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
  const state = useModels(files);
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="text-heading">
        {MODELS_HEADING}
      </h2>
      <AliasList
        state={state}
        open={(name) => context.openItem?.({ kind: ALIAS_KIND, hub: "local", id: name })}
      />
    </section>
  );
}

function AliasList({
  state,
  open,
}: {
  readonly state: ModelsState;
  readonly open: (name: string) => void;
}) {
  if (state.status === "loading") return null;
  if (state.status === "unreadable") return <p>{MODELS_UNREADABLE_LINE}</p>;
  const rows = aliasRows(state.models);
  if (rows.length === 0) return <p>{NO_ALIASES_LINE}</p>;
  return (
    <ul className="flex flex-col">
      {rows.map((row) => (
        <li key={row.name}>
          <button type="button" className="text-left" onClick={() => open(row.name)}>
            {row.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
