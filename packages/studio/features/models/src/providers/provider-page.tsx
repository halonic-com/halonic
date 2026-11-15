import { EmptyState } from "@halonicjs/studio-kit";
import type { ItemViewProps } from "@halonicjs/studio-shell";
import { MODELS_LOADING_LINE } from "../aliases/alias-text.ts";
import { fileId } from "../aliases/read-models.ts";
import { useModels } from "../aliases/use-models.ts";
import { ModelKeysService, ModelsFilesService } from "../api.ts";
import { KeyBlock } from "../api-keys/key-block.tsx";
import { ProviderFields } from "./provider-fields.tsx";
import { providerName, providerPlace } from "./provider-rows.ts";
import {
  blockedLocalOnlyLine,
  PROVIDER_CAPTION,
  PROVIDER_FILE_UNREADABLE_TITLE,
  PROVIDER_GONE_LINE,
  PROVIDERS_UNREADABLE_REASON,
  PROVIDERS_UNREADABLE_TITLE,
  providerFileUnreadableLine,
  TRY_AGAIN,
} from "./provider-text.ts";

/**
 * A provider's tab (`models.providers.list-and-show`): its type, base URL and secret name,
 * and a warning when the workspace is local only and the provider is not. Its fields are edited
 * in place (`models.providers.edit`).
 *
 * @example
 * <ProviderPage item={{ kind: "model-provider", hub: "local", id: "anthropic" }} context={context} />
 */
export function ProviderPage({ item, context }: ItemViewProps) {
  const files = context.services.get(ModelsFilesService);
  const keys = context.services.find(ModelKeysService);
  const [state, retry] = useModels(files);
  const entry =
    state.status !== "loading"
      ? state.providerFiles.find(({ provider }) => provider.id === item.id)
      : undefined;
  const brokenFile =
    state.status !== "loading" && entry === undefined
      ? state.unreadableProviderFiles.find((path) => fileId(path) === item.id)
      : undefined;
  return (
    <div className="flex w-full flex-col gap-3 px-6 py-5">
      <p className="text-label uppercase text-fg-subtle">{PROVIDER_CAPTION}</p>
      <h1 className="text-title">{entry ? providerName(entry.provider) : item.id}</h1>
      {state.status === "loading" ? <p role="status">{MODELS_LOADING_LINE}</p> : null}
      {state.status === "loading" || entry !== undefined ? null : (
        <MissingProvider
          providersFailed={state.providersFailed}
          brokenFile={brokenFile}
          retry={retry}
        />
      )}
      {state.status !== "loading" && entry !== undefined ? (
        <>
          {state.localOnly && providerPlace(entry.provider) === "cloud" ? (
            <p role="alert">{blockedLocalOnlyLine(state.workspaceName)}</p>
          ) : null}
          <ProviderFields files={files} provider={entry.provider} path={entry.path} />
          {keys === undefined ? null : (
            <KeyBlock
              keys={keys}
              secretName={entry.provider.secret}
              providerName={providerName(entry.provider)}
            />
          )}
        </>
      ) : null}
    </div>
  );
}

interface MissingProviderProps {
  readonly providersFailed: boolean;
  readonly brokenFile: string | undefined;
  readonly retry: () => void;
}

/** What the page says instead of the fields: the folder or this file can't be read, or the provider is gone. */
function MissingProvider({ providersFailed, brokenFile, retry }: MissingProviderProps) {
  if (providersFailed || brokenFile !== undefined) {
    return (
      <EmptyState
        tone="error"
        align="start"
        headingLevel={3}
        title={providersFailed ? PROVIDERS_UNREADABLE_TITLE : PROVIDER_FILE_UNREADABLE_TITLE}
        description={
          providersFailed
            ? PROVIDERS_UNREADABLE_REASON
            : providerFileUnreadableLine(brokenFile ?? "")
        }
        action={{ label: TRY_AGAIN, onClick: retry }}
      />
    );
  }
  return <p>{PROVIDER_GONE_LINE}</p>;
}
