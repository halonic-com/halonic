import { type Models, parseFile } from "@halonicjs/format";
import type { ModelsFiles } from "../api.ts";

/** What the alias views know of `models.yaml`: still reading, unreadable, or its aliases. */
export type ModelsState =
  | { readonly status: "loading" }
  | { readonly status: "unreadable" }
  | { readonly status: "ready"; readonly models: Models };

/** The workspace's aliases; no `models.yaml` is no aliases, a file that doesn't parse is unreadable. */
export async function readModels(files: ModelsFiles): Promise<ModelsState> {
  const text = await files.readModels().catch(() => undefined);
  if (text === undefined) return { status: "unreadable" };
  if (text === null) return { status: "ready", models: { version: 1, aliases: {} } as Models };
  const parsed = parseFile("models", text);
  return parsed.ok ? { status: "ready", models: parsed.value.value } : { status: "unreadable" };
}
