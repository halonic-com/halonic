// Which models Ollama on this computer has downloaded, for the first run's
// model screen, Check this computer and `halonic doctor`. One version, so the
// three never disagree about what is on this computer. The question itself
// goes through a `DownloadedModelSource`: this file asks nothing and waits
// for nothing.

import { isPlainObject } from "@halonicjs/std";

/**
 * What the model detection found on this computer, one of the states of the
 * first run's model screen. The browser demo with no engine isn't one: the
 * caller knows it before asking.
 */
export type LocalModels =
  /** Ollama answers with exactly one downloaded model. */
  | { readonly kind: "one"; readonly model: string }
  /** Ollama answers with two or more downloaded models, in Ollama's order. */
  | { readonly kind: "several"; readonly models: readonly string[] }
  /** Ollama answers, but has no model downloaded. */
  | { readonly kind: "none-downloaded" }
  /**
   * Ollama didn't answer in time, answered with an error status, or sent
   * what isn't its list. `cause` says which, so `doctor` can say why.
   */
  | { readonly kind: "not-found"; readonly cause: unknown };

/** Where the detection asks for the downloaded models, such as Ollama's `/api/tags`. */
export interface DownloadedModelSource {
  /**
   * The names of the downloaded models, in the order the server gives them.
   *
   * @throws when the server doesn't answer in time, answers with an error
   *   status, or sends what isn't its list
   */
  downloadedModels(): Promise<readonly string[]>;
}

/**
 * Asks `source` which models are downloaded and says which state that is.
 * It never throws: a source that fails is `not-found`, with its error as
 * the `cause`.
 *
 * @example
 * await detectLocalModels({ downloadedModels: async () => ["llama3.2"] });
 * // { kind: "one", model: "llama3.2" }
 */
export async function detectLocalModels(source: DownloadedModelSource): Promise<LocalModels> {
  let models: readonly string[];
  try {
    models = await source.downloadedModels();
  } catch (cause) {
    return { kind: "not-found", cause };
  }
  const [first] = models;
  if (first === undefined) return { kind: "none-downloaded" };
  if (models.length === 1) return { kind: "one", model: first };
  return { kind: "several", models: [...models] };
}

/**
 * The model names in Ollama's answer to `GET /api/tags`, in its order. The
 * `:latest` tag is dropped, as people type the name without it.
 *
 * @throws when the answer has no `models` list, or a model in it has no name
 *
 * @example
 * ollamaDownloadedModels({ models: [{ name: "llama3.2:latest" }, { name: "qwen3:8b" }] });
 * // ["llama3.2", "qwen3:8b"]
 */
export function ollamaDownloadedModels(body: unknown): string[] {
  const list = isPlainObject(body) ? body["models"] : undefined;
  if (!Array.isArray(list)) throw new Error(`Ollama's answer has no "models" list.`);
  return list.map((entry: unknown) => {
    const name = isPlainObject(entry) ? entry["name"] : undefined;
    if (typeof name !== "string" || name === "")
      throw new Error(`A model in Ollama's answer has no "name".`);
    return name.replace(/:latest$/, "");
  });
}
