import { defaultCurrency } from "@halonicjs/app";
import { type Models, type Provider, parseFile, type WorkspaceSettings } from "@halonicjs/format";
import type { ModelsFiles } from "../api.ts";

/** What the provider views know of the workspace; it doesn't depend on `models.yaml`. */
export interface ProvidersState {
  readonly providers: readonly Provider[];
  /** The providers with the file each was read from, in the order of `providers`. */
  readonly providerFiles: readonly ProviderEntry[];
  /** True when `workspace.yaml` says only local providers may be used. */
  readonly localOnly: boolean;
  /** The workspace's name, for words that name it; `undefined` when `workspace.yaml` doesn't read. */
  readonly workspaceName: string | undefined;
  /** The `budget` of `workspace.yaml`, as written; `undefined` when there is none. */
  readonly budget: WorkspaceSettings["budget"];
  readonly localProviders: ReadonlySet<string>;
}

/**
 * What the Models views know of the workspace: still reading, `models.yaml` unreadable, or its
 * aliases with the budget currency. Either way the providers that read come with it, so a broken
 * `models.yaml` doesn't hide them.
 */
export type ModelsState =
  | { readonly status: "loading" }
  | ({ readonly status: "unreadable" } & ProvidersState)
  | ({
      readonly status: "ready";
      readonly models: Models;
      readonly currency: string;
    } & ProvidersState);

/** A provider that read, with the path of its file. */
export interface ProviderEntry {
  readonly path: string;
  readonly provider: Provider;
}

/** The workspace's aliases and providers; no `models.yaml` is no aliases, a file that doesn't parse is unreadable. */
export async function readModels(files: ModelsFiles): Promise<ModelsState> {
  const [entries, text] = await Promise.all([
    readProviderEntries(files),
    files.readModels().catch(() => undefined),
  ]);
  const providers = entries.map(({ provider }) => provider);
  const workspace = await readWorkspace(files);
  const around: ProvidersState = {
    providers,
    providerFiles: entries,
    localOnly: workspace?.privacy.localOnly ?? false,
    workspaceName: workspace?.name,
    budget: workspace?.budget,
    localProviders: new Set(providers.filter((provider) => provider.local).map(({ id }) => id)),
  };
  const models = text === undefined ? undefined : parseModelsOrEmpty(text);
  if (models === undefined) return { status: "unreadable", ...around };
  return {
    status: "ready",
    models,
    currency: workspace?.budget?.currency ?? defaultCurrency,
    ...around,
  };
}

/** No `models.yaml` is no aliases. */
function parseModelsOrEmpty(text: string | null): Models | undefined {
  return text === null ? ({ version: 1, aliases: {} } as Models) : parseModels(text);
}

function parseModels(text: string): Models | undefined {
  const parsed = parseFile("models", text);
  return parsed.ok ? parsed.value.value : undefined;
}

/** `workspace.yaml` as read; a missing or unreadable file reads as none. */
async function readWorkspace(files: ModelsFiles) {
  const text = await files.readWorkspace().catch(() => null);
  const parsed = text === null ? undefined : parseFile("workspace", text);
  return parsed?.ok ? parsed.value.value : undefined;
}

/** The providers whose files read; a file that doesn't read, or none at all, is left out of the list. */
async function readProviderEntries(files: ModelsFiles): Promise<ProviderEntry[]> {
  const found = await files.readProviders().catch(() => []);
  return found.flatMap(({ path, text }) => {
    const id = path.replace(/^.*\//, "").replace(/\.ya?ml$/, "");
    const parsed = parseFile("provider", text, { id });
    return parsed.ok ? [{ path, provider: parsed.value.value }] : [];
  });
}
