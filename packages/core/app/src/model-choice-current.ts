// What the workspace's `default` alias uses now, for the Model row of a served window's
// Settings › Models (HAL-16248): the facts the row names it by, the way the Pick a model screen
// (first-run-flow 3.3) names its options. It reads the files and writes nothing.

import { parseFile } from "@halonicjs/format";
import { firstRunAlias } from "./model-choice-edits.ts";
import type { ModelChoiceFileReads } from "./model-choice-service.ts";

/**
 * What `default` uses:
 * - `sample`: the built-in test model (`type: mock`), which the screen calls Sample answers.
 * - `provider`: a provider of the workspace, by the name a person reads ("Anthropic", or the
 *   file's id when it has no name), with the model and whether it runs on this computer.
 */
export type CurrentModel =
  | { readonly kind: "sample" }
  | {
      readonly kind: "provider";
      readonly name: string;
      readonly model: string;
      readonly local: boolean;
    };

/**
 * What the `default` alias uses now; `undefined` when there is no `default`, or `models.yaml` or
 * its provider's file is missing or can't be read.
 *
 * @example
 * await currentModel(files); // { kind: "provider", name: "Anthropic", model: "claude-haiku-5-5", local: false }
 */
export async function currentModel(files: ModelChoiceFileReads): Promise<CurrentModel | undefined> {
  const modelsText = await files.readModels();
  const models = modelsText === null ? undefined : parseFile("models", modelsText);
  if (models === undefined || !models.ok) return undefined;
  const { aliases } = models.value.value;
  const alias = Object.hasOwn(aliases, firstRunAlias) ? aliases[firstRunAlias] : undefined;
  if (alias === undefined) return undefined;
  const providerText = await files.readProvider(`providers/${alias.provider}.yaml`);
  const provider =
    providerText === null ? undefined : parseFile("provider", providerText, { id: alias.provider });
  if (provider === undefined || !provider.ok) return undefined;
  const file = provider.value.value;
  if (file.type === "mock") return { kind: "sample" };
  return { kind: "provider", name: file.name ?? file.id, model: alias.model, local: file.local };
}
