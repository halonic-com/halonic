import { defaultCurrency } from "@halonicjs/app";
import { type Models, type Provider, parseFile } from "@halonicjs/format";
import type { ModelsFiles } from "../api.ts";

/**
 * What the alias views know of the workspace: still reading, unreadable, or its aliases with the
 * budget currency, the providers that read, and the ids of those that run on this machine.
 */
export type ModelsState =
  | { readonly status: "loading" }
  | { readonly status: "unreadable" }
  | {
      readonly status: "ready";
      readonly models: Models;
      readonly currency: string;
      readonly providers: readonly Provider[];
      readonly localProviders: ReadonlySet<string>;
    };

/** The workspace's aliases; no `models.yaml` is no aliases, a file that doesn't parse is unreadable. */
export async function readModels(files: ModelsFiles): Promise<ModelsState> {
  const providers = await readProviders(files);
  const text = await files.readModels().catch(() => undefined);
  if (text === undefined) return { status: "unreadable" };
  const models = text === null ? ({ version: 1, aliases: {} } as Models) : parseModels(text);
  if (models === undefined) return { status: "unreadable" };
  return {
    status: "ready",
    models,
    currency: await readCurrency(files),
    providers,
    localProviders: new Set(providers.filter((provider) => provider.local).map(({ id }) => id)),
  };
}

function parseModels(text: string): Models | undefined {
  const parsed = parseFile("models", text);
  return parsed.ok ? parsed.value.value : undefined;
}

/** `budget.currency` of `workspace.yaml`; a missing or unreadable file reads as the default. */
async function readCurrency(files: ModelsFiles): Promise<string> {
  const text = await files.readWorkspace().catch(() => null);
  const parsed = text === null ? undefined : parseFile("workspace", text);
  return (parsed?.ok ? parsed.value.value.budget?.currency : undefined) ?? defaultCurrency;
}

/** The providers whose files read; a file that doesn't read, or none at all, is left out of the list. */
async function readProviders(files: ModelsFiles): Promise<Provider[]> {
  const found = await files.readProviders().catch(() => []);
  return found.flatMap(({ path, text }) => {
    const id = path.replace(/^.*\//, "").replace(/\.ya?ml$/, "");
    const parsed = parseFile("provider", text, { id });
    return parsed.ok ? [parsed.value.value] : [];
  });
}
