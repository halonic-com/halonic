import { EmptyState } from "@halonicjs/studio-kit";
import type { ItemPageSectionViewProps } from "@halonicjs/studio-shell";
import { useId } from "react";
import { TRY_AGAIN } from "../aliases/alias-text.ts";
import { useModels } from "../aliases/use-models.ts";
import { ModelsFilesService } from "../api.ts";
import { providerRows } from "./provider-rows.ts";
import {
  NO_PROVIDERS_LINE,
  PROVIDER_KIND,
  PROVIDERS_HEADING,
  PROVIDERS_LOADING_LINE,
  PROVIDERS_UNREADABLE_REASON,
  PROVIDERS_UNREADABLE_TITLE,
} from "./provider-text.ts";

/**
 * The **Providers** section of the workspace page (`models.providers.list-and-show`): the files of
 * `providers/` by id, each with its type and "local" or "cloud", each opening its provider page.
 *
 * @example
 * <ProvidersSection item={WORKSPACE_PAGE_ITEM} context={context} />
 */
export function ProvidersSection({ context }: ItemPageSectionViewProps) {
  const [state, retry] = useModels(context.services.get(ModelsFilesService));
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="text-heading">
        {PROVIDERS_HEADING}
      </h2>
      {state.status === "loading" ? <p role="status">{PROVIDERS_LOADING_LINE}</p> : null}
      {state.status === "unreadable" ? (
        <EmptyState
          tone="error"
          align="start"
          headingLevel={3}
          title={PROVIDERS_UNREADABLE_TITLE}
          description={PROVIDERS_UNREADABLE_REASON}
          action={{ label: TRY_AGAIN, onClick: retry }}
        />
      ) : null}
      {state.status === "ready" && state.providerFiles.length === 0 ? (
        <p>{NO_PROVIDERS_LINE}</p>
      ) : null}
      {state.status === "ready" ? (
        <ul className="flex flex-col">
          {providerRows(state.providerFiles).map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className="text-left"
                onClick={() =>
                  context.openItem?.({ kind: PROVIDER_KIND, hub: "local", id: row.id })
                }
              >
                {row.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
