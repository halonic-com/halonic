import { EmptyState } from "@halonicjs/studio-kit";
import type { ItemViewProps } from "@halonicjs/studio-shell";
import { useEffect, useState } from "react";
import { ModelsFilesService } from "../api.ts";
import { AliasFields } from "./alias-fields.tsx";
import {
  ALIAS_GONE_LINE,
  ALIAS_KIND_LABEL,
  ALIAS_UNREADABLE_TITLE,
  aliasIntro,
  aliasLoadingLine,
  aliasTitle,
  GO_TO_MODELS,
  MODELS_PAGE_ITEM,
  MODELS_UNREADABLE_REASON,
  STILL_LOADING_LINE,
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
      <p className="text-label uppercase text-fg-subtle">{ALIAS_KIND_LABEL}</p>
      <h1 className="text-title">{aliasTitle(item.id)}</h1>
      <p>{aliasIntro(item.id)}</p>
      {state.status === "loading" ? <LoadingLine name={item.id} retry={retry} /> : null}
      {state.status === "unreadable" ? (
        <EmptyState
          tone="error"
          align="start"
          headingLevel={3}
          title={ALIAS_UNREADABLE_TITLE}
          description={MODELS_UNREADABLE_REASON}
          action={{ label: TRY_AGAIN, onClick: retry }}
        />
      ) : null}
      {state.status === "ready" && state.models.aliases[item.id] === undefined ? (
        <EmptyState
          plain
          headingLevel={3}
          title={ALIAS_GONE_LINE}
          action={{ label: GO_TO_MODELS, onClick: () => context.openItem?.(MODELS_PAGE_ITEM) }}
        />
      ) : null}
      {state.status === "ready" ? (
        <AliasFields
          files={files}
          models={state.models}
          providers={state.providers}
          name={item.id}
        />
      ) : null}
    </div>
  );
}

/** How long a tab reads before it says it is still loading and offers **Try again**. */
const STILL_LOADING_AFTER_MS = 10_000;

function LoadingLine({ name, retry }: { readonly name: string; readonly retry: () => void }) {
  const [slow, setSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), STILL_LOADING_AFTER_MS);
    return () => clearTimeout(timer);
  }, [attempt]);
  return (
    <p role="status">
      {slow ? `${STILL_LOADING_LINE} · ` : aliasLoadingLine(name)}
      {slow ? (
        <button
          type="button"
          onClick={() => {
            setSlow(false);
            setAttempt((n) => n + 1);
            retry();
          }}
        >
          {TRY_AGAIN}
        </button>
      ) : null}
    </p>
  );
}
