import type { Provider } from "@halonicjs/format";
import { EmptyState } from "@halonicjs/studio-kit";
import type { ItemViewProps } from "@halonicjs/studio-shell";
import { MODELS_LOADING_LINE } from "../aliases/alias-text.ts";
import { fileId, type ProviderEntry, type ProvidersState } from "../aliases/read-models.ts";
import { useModels } from "../aliases/use-models.ts";
import {
  type ModelKeys,
  ModelKeysService,
  type ModelsFiles,
  ModelsFilesService,
  NoLimitMemoryService,
  type ProviderCheck,
  ProviderCheckService,
} from "../api.ts";
import { KeyBlock } from "../api-keys/key-block.tsx";
import { becamePayPerUse } from "../budget-step/step-asks.ts";
import { useStepOffer } from "../budget-step/use-step-offer.tsx";
import { CheckProvider } from "./provider-check.tsx";
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

/** The step that opens a provider's tab at its key, as `openItem(provider, { step: "key" })`. */
export const KEY_STEP = "key";

/**
 * A provider's tab (`models.providers.list-and-show`): its type, base URL and secret name,
 * and a warning when the workspace is local only and the provider is not. Its fields are edited
 * in place (`models.providers.edit`). Opened with the step `key`, it opens at the key field
 * (`models.api-keys.open-at-key`).
 *
 * @example
 * <ProviderPage item={{ kind: "model-provider", hub: "local", id: "anthropic" }} context={context} />
 */
export function ProviderPage({ item, context, step, asked }: ItemViewProps) {
  const files = context.services.get(ModelsFilesService);
  const keys = context.services.find(ModelKeysService);
  const memory = context.services.find(NoLimitMemoryService);
  const check = context.services.find(ProviderCheckService);
  const [state, retry] = useModels(files);
  const entry =
    state.status !== "loading"
      ? state.providerFiles.find(({ provider }) => provider.id === item.id)
      : undefined;
  const { offer, dialog } = useStepOffer(files, state, memory);
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
        <FoundProvider
          state={state}
          entry={entry}
          files={files}
          keys={keys}
          check={check}
          offer={offer}
          focusRequest={step === KEY_STEP ? `${item.id}/${asked ?? 0}` : undefined}
        />
      ) : null}
      {dialog}
    </div>
  );
}

interface FoundProviderProps {
  readonly state: ProvidersState;
  readonly entry: ProviderEntry;
  readonly files: ModelsFiles;
  readonly keys: ModelKeys | undefined;
  readonly check: ProviderCheck | undefined;
  /** Offers the Prices and budget step for the provider. */
  readonly offer: (provider: Provider) => void;
  /** Set when the page was opened at the key (`models.api-keys.open-at-key`). */
  readonly focusRequest: string | undefined;
}

/** The page of a provider the workspace has: the local-only warning, the check, the fields and the key. */
function FoundProvider({
  state,
  entry,
  files,
  keys,
  check,
  offer,
  focusRequest,
}: FoundProviderProps) {
  return (
    <>
      {state.localOnly && providerPlace(entry.provider) === "cloud" ? (
        <p role="alert">{blockedLocalOnlyLine(state.workspaceName)}</p>
      ) : null}
      <CheckProvider check={check} provider={entry.provider} />
      <ProviderFields
        files={files}
        provider={entry.provider}
        path={entry.path}
        onEdited={(before, after) => {
          if (becamePayPerUse(before, after)) offer(after);
        }}
      />
      {keys === undefined ? null : (
        <KeyBlock
          keys={keys}
          secretName={entry.provider.secret}
          providerName={providerName(entry.provider)}
          onFirstKey={() => offer(entry.provider)}
          focusRequest={focusRequest}
        />
      )}
    </>
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
