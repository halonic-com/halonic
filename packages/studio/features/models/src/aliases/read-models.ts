import { type Models, type Provider, parseFile } from "@halonicjs/format";
import type { ModelsFiles } from "../api.ts";

/** What the alias views know of the workspace's models: still reading, unreadable, or the aliases and providers. */
export type ModelsState =
  | { readonly status: "loading" }
  | { readonly status: "unreadable" }
  | { readonly status: "ready"; readonly models: Models; readonly providers: readonly Provider[] };

/** The workspace's aliases; no `models.yaml` is no aliases, a file that doesn't parse is unreadable. */
export async function readModels(files: ModelsFiles): Promise<ModelsState> {
  const providers = await readProviders(files);
  const text = await files.readModels().catch(() => undefined);
  if (text === undefined) return { status: "unreadable" };
  if (text === null)
    return { status: "ready", models: { version: 1, aliases: {} } as Models, providers };
  const parsed = parseFile("models", text);
  return parsed.ok
    ? { status: "ready", models: parsed.value.value, providers }
    : { status: "unreadable" };
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
