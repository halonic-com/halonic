import { ALIAS_KIND } from "../aliases/alias-text.ts";
import { readModels } from "../aliases/read-models.ts";
import type { ModelKeys, Models, ModelsFiles, ProviderPageTarget } from "../api.ts";
import { KEY_STEP, PROVIDER_KIND } from "../providers/provider-text.ts";
import type { PageRequests } from "./page-requests.ts";

/**
 * The command that opens the workspace page's Models, which the workspace feature adds. It is where
 * a secret name no provider uses leads, so the link still goes somewhere useful.
 */
export const OPEN_MODELS_COMMAND = "workspace.open-models";

/** What `ModelsService` is built from, for one open folder. */
export interface WorkspaceModelsParts {
  readonly files: ModelsFiles;
  /** The app's key store; `undefined` where it gives none, such as the browser demo. */
  readonly keys: ModelKeys | undefined;
  readonly requests: PageRequests;
}

/**
 * The `ModelsService` of one open folder (`models.api-keys.open-by-secret`). It opens pages by
 * asking the window through `requests`, since a service has no window of its own.
 */
export function createWorkspaceModels({ files, keys, requests }: WorkspaceModelsParts): Models {
  return {
    keyStored: async (secretName) => (keys === undefined ? false : keys.stored(secretName)),
    openProviderPage: (secretName, target) => {
      void requestProviderPage(files, requests, secretName, target ?? "key");
    },
    // The alias tab has no price step yet, so `focusPrice` opens it at the top for now.
    openAlias: (name) => {
      requests.add({ open: "item", item: { kind: ALIAS_KIND, hub: "local", id: name } });
    },
  };
}

/** Asks for the page of the first provider, by file name, whose `secret` is `secretName`. */
async function requestProviderPage(
  files: ModelsFiles,
  requests: PageRequests,
  secretName: string,
  target: ProviderPageTarget,
): Promise<void> {
  const state = await readModels(files);
  const entry =
    state.status === "loading"
      ? undefined
      : state.providerFiles.find(({ provider }) => provider.secret === secretName);
  if (entry === undefined) {
    requests.add({ open: "command", commandId: OPEN_MODELS_COMMAND });
    return;
  }
  const item = { kind: PROVIDER_KIND, hub: "local", id: entry.provider.id };
  requests.add(
    target === "key" ? { open: "item", item, options: { step: KEY_STEP } } : { open: "item", item },
  );
}
