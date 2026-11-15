import type { ItemViewProps } from "@halonicjs/studio-shell";
import { MODELS_LOADING_LINE } from "../aliases/alias-text.ts";
import { useModels } from "../aliases/use-models.ts";
import { ModelsFilesService } from "../api.ts";
import { ProviderFields } from "./provider-fields.tsx";
import { providerName, providerPlace } from "./provider-rows.ts";
import { blockedLocalOnlyLine, PROVIDER_GONE_LINE, providerTitle } from "./provider-text.ts";

/**
 * A provider's tab (`models.providers.list-and-show`): its type, base URL, secret name and file,
 * and a warning when the workspace is local only and the provider is not. Its fields are edited
 * in place (`models.providers.edit`).
 *
 * @example
 * <ProviderPage item={{ kind: "model-provider", hub: "local", id: "anthropic" }} context={context} />
 */
export function ProviderPage({ item, context }: ItemViewProps) {
  const files = context.services.get(ModelsFilesService);
  const [state] = useModels(files);
  const entry =
    state.status !== "loading"
      ? state.providerFiles.find(({ provider }) => provider.id === item.id)
      : undefined;
  return (
    <div className="flex w-full flex-col gap-3 px-6 py-5">
      <h1 className="text-title">
        {providerTitle(entry ? providerName(entry.provider) : item.id)}
      </h1>
      {state.status === "loading" ? <p role="status">{MODELS_LOADING_LINE}</p> : null}
      {state.status !== "loading" && entry === undefined ? <p>{PROVIDER_GONE_LINE}</p> : null}
      {state.status !== "loading" && entry !== undefined ? (
        <>
          {state.localOnly && providerPlace(entry.provider) === "cloud" ? (
            <p role="alert">{blockedLocalOnlyLine(state.workspaceName)}</p>
          ) : null}
          <ProviderFields files={files} provider={entry.provider} path={entry.path} />
          <p>
            File: <code>{entry.path}</code>
          </p>
        </>
      ) : null}
    </div>
  );
}
