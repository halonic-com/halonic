import { EmptyState } from "@halonicjs/studio-kit";
import type { ItemViewProps } from "@halonicjs/studio-shell";
import { MODELS_LOADING_LINE, TRY_AGAIN } from "../aliases/alias-text.ts";
import { useModels } from "../aliases/use-models.ts";
import { ModelsFilesService } from "../api.ts";
import { providerName, providerPlace } from "./provider-rows.ts";
import {
  blockedLocalOnlyLine,
  DEFAULT_BASE_URL,
  NO_SECRET,
  PROVIDER_GONE_LINE,
  PROVIDERS_UNREADABLE_REASON,
  PROVIDERS_UNREADABLE_TITLE,
  providerTitle,
} from "./provider-text.ts";

/**
 * A provider's tab (`models.providers.list-and-show`): its type, base URL, secret name and file,
 * and a warning when the workspace is local only and the provider is not. The fields are read-only
 * here; editing comes with `models.providers.edit`.
 *
 * @example
 * <ProviderPage item={{ kind: "model-provider", hub: "local", id: "anthropic" }} context={context} />
 */
export function ProviderPage({ item, context }: ItemViewProps) {
  const [state, retry] = useModels(context.services.get(ModelsFilesService));
  const entry =
    state.status === "ready"
      ? state.providerFiles.find(({ provider }) => provider.id === item.id)
      : undefined;
  return (
    <div className="flex w-full flex-col gap-3 px-6 py-5">
      <h1 className="text-title">
        {providerTitle(entry ? providerName(entry.provider) : item.id)}
      </h1>
      {state.status === "loading" ? <p role="status">{MODELS_LOADING_LINE}</p> : null}
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
      {state.status === "ready" && entry === undefined ? <p>{PROVIDER_GONE_LINE}</p> : null}
      {state.status === "ready" && entry !== undefined ? (
        <>
          {state.localOnly && providerPlace(entry.provider) === "cloud" ? (
            <p role="alert">{blockedLocalOnlyLine(state.workspaceName)}</p>
          ) : null}
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
            <dt>Type</dt>
            <dd>{entry.provider.type}</dd>
            <dt>Base URL</dt>
            <dd>{entry.provider.baseUrl ?? DEFAULT_BASE_URL}</dd>
            <dt>Secret name</dt>
            <dd>{entry.provider.secret ?? NO_SECRET}</dd>
            <dt>File</dt>
            <dd>
              <code>{entry.path}</code>
            </dd>
          </dl>
        </>
      ) : null}
    </div>
  );
}
