// The words of a served window's Settings › Models (HAL-16248, option A): one Model row that names
// the current model the way the Pick a model screen (first-run-flow 3.3) names its options, and
// opens that screen.

import type { CurrentModel } from "@halonicjs/app";
import { pickModelWords } from "../pick-model/pick-model-words.ts";

/** The fixed words of the section. */
export const servedModelsWords = {
  title: "Models",
  model: "Model",
  pick: pickModelWords.heading,
} as const;

/**
 * The current model as the Model row names it: "Sample answers" for the test model, a model on
 * this computer by its model name ("llama3.2"), a cloud provider by its name ("Anthropic");
 * `undefined` when there is none to name.
 */
export function currentModelName(current: CurrentModel | undefined): string | undefined {
  if (current === undefined) return undefined;
  if (current.kind === "sample") return "Sample answers";
  return current.local ? current.model : current.name;
}
