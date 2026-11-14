import { EmptyState } from "@halonicjs/studio-kit";
import type { ItemViewProps } from "@halonicjs/studio-shell";
import { ModelsFilesService } from "../api.ts";
import { AliasFields } from "./alias-fields.tsx";
import {
  ALIAS_GONE_LINE,
  aliasIntro,
  aliasTitle,
  MODELS_LOADING_LINE,
  MODELS_UNREADABLE_REASON,
  MODELS_UNREADABLE_TITLE,
  TRY_AGAIN,
} from "./alias-text.ts";
import { useModels } from "./use-models.ts";

/**
 * An alias's tab (`models.aliases.list`): its title, what an alias is, and its fields. An alias
 * that is no longer in `models.yaml` says so; the tab is not closed for the user.
 *
 * @example
 * <AliasTab item={{ kind: "model-alias", hub: "local", id: "smart" }} context={context} />
 */
export function AliasTab({ item, context }: ItemViewProps) {
  const files = context.services.get(ModelsFilesService);
  const [state, retry] = useModels(files);
  return (
    <div className="flex w-full flex-col gap-3 px-6 py-5">
      <h1 className="text-title">{aliasTitle(item.id)}</h1>
      <p>{aliasIntro(item.id)}</p>
      {state.status === "loading" ? <p role="status">{MODELS_LOADING_LINE}</p> : null}
      {state.status === "unreadable" ? (
        <EmptyState
          tone="error"
          align="start"
          headingLevel={3}
          title={MODELS_UNREADABLE_TITLE}
          description={MODELS_UNREADABLE_REASON}
          action={{ label: TRY_AGAIN, onClick: retry }}
        />
      ) : null}
      {state.status === "ready" && state.models.aliases[item.id] === undefined ? (
        <p>{ALIAS_GONE_LINE}</p>
      ) : null}
      {state.status === "ready" ? (
        <AliasFields files={files} models={state.models} name={item.id} />
      ) : null}
    </div>
  );
}
