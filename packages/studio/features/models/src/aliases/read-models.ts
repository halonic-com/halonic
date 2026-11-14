import { defaultCurrency } from "@halonicjs/app";
import { type Models, parseFile } from "@halonicjs/format";
import type { ModelsFiles } from "../api.ts";

/**
 * What the alias views know of the workspace: still reading, unreadable, or its aliases with the
 * budget currency and the ids of the providers that run on this machine.
 */
export type ModelsState =
  | { readonly status: "loading" }
  | { readonly status: "unreadable" }
  | {
      readonly status: "ready";
      readonly models: Models;
      readonly currency: string;
      readonly localProviders: ReadonlySet<string>;
    };

/** The workspace's aliases; no `models.yaml` is no aliases, a file that doesn't parse is unreadable. */
export async function readModels(files: ModelsFiles): Promise<ModelsState> {
  const text = await files.readModels().catch(() => undefined);
  if (text === undefined) return { status: "unreadable" };
  const models = text === null ? ({ version: 1, aliases: {} } as Models) : parseModels(text);
  if (models === undefined) return { status: "unreadable" };
  return {
    status: "ready",
    models,
    currency: await readCurrency(files),
    localProviders: await readLocalProviders(files),
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

/** The ids of the providers whose file says it runs on this machine or the user's network. */
async function readLocalProviders(files: ModelsFiles): Promise<ReadonlySet<string>> {
  const provided = await files.readProviders().catch(() => []);
  const local = new Set<string>();
  for (const { text } of provided) {
    const parsed = parseFile("provider", text);
    if (parsed.ok && parsed.value.value.local) local.add(parsed.value.value.id);
  }
  return local;
}
