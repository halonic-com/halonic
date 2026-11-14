import { err, ok, parseAmount, type Result } from "@halonicjs/std";
import { editYaml, type YamlEdit } from "@halonicjs/yaml";
import { ZERO_PRICE_WARNING } from "./alias-text.ts";

/** What is wrong with a field, in the words the field shows under itself. */
export interface FieldProblem {
  readonly field: "model" | "input" | "output" | "yaml";
  readonly message: string;
}

const amountMessage = "Enter an amount, like you'd write it on a receipt.";

/** Applies the edits to the text of `models.yaml`; a file that can't be read is a `yaml` problem. */
function applyEdits(text: string, edits: readonly YamlEdit[]): Result<string, FieldProblem> {
  const edited = editYaml(text, edits);
  return edited.ok
    ? ok(edited.value.text)
    : err({ field: "yaml", message: "models.yaml could not be changed. Fix the file first." });
}

/**
 * Points an alias at a provider and model. An empty model name writes nothing.
 *
 * @param text - the text of `models.yaml`
 * @param previousModel - the model the alias has now, offered back in the field's message
 */
export function editAliasTarget(
  text: string,
  alias: string,
  target: { readonly provider: string; readonly model: string },
  previousModel: string,
): Result<string, FieldProblem> {
  const model = target.model.trim();
  if (model === "") {
    return err({ field: "model", message: `Give the model a name. Put back ${previousModel}.` });
  }
  return applyEdits(text, [
    { kind: "set", path: ["aliases", alias, "provider"], value: target.provider },
    { kind: "set", path: ["aliases", alias, "model"], value: model },
  ]);
}

/** Splits "default, , fast" into the alias names it lists, in order. */
export function parseFallbacks(field: string): string[] {
  return field
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "");
}

/** Saves the comma-separated alias names of the "Fallbacks" field as the alias's `fallback` list. */
export function editAliasFallbacks(
  text: string,
  alias: string,
  field: string,
): Result<string, FieldProblem> {
  return applyEdits(text, [
    { kind: "set", path: ["aliases", alias, "fallback"], value: parseFallbacks(field) },
  ]);
}

/**
 * Saves the two price fields as the alias's `price`. Both empty removes it. With one still empty,
 * nothing is written (the other is being filled in) unless the one that is filled isn't an amount.
 * The cache prices the file may already have stay as they are.
 */
export function editAliasPrice(
  text: string,
  alias: string,
  fields: { readonly input: string; readonly output: string },
): Result<string, FieldProblem> {
  if (fields.input.trim() === "" && fields.output.trim() === "") {
    return applyEdits(text, [{ kind: "delete", path: ["aliases", alias, "price"] }]);
  }
  const inputEmpty = fields.input.trim() === "";
  const outputEmpty = fields.output.trim() === "";
  const input = parseAmount(fields.input);
  if (input === undefined && !inputEmpty) {
    return err({ field: "input", message: amountMessage });
  }
  const output = parseAmount(fields.output);
  if (output === undefined && !outputEmpty) {
    return err({ field: "output", message: amountMessage });
  }
  if (input === undefined || output === undefined) return ok(text);
  return applyEdits(text, [
    { kind: "set", path: ["aliases", alias, "price", "input"], value: input },
    { kind: "set", path: ["aliases", alias, "price", "output"], value: output },
  ]);
}

/** The warning under the price fields for a cloud alias priced at 0, or `undefined`; an empty field (`undefined`) is no price. */
export function zeroPriceWarning(
  price: { readonly input: number | undefined; readonly output: number | undefined },
  providerIsLocal: boolean,
): string | undefined {
  if (providerIsLocal || (price.input !== 0 && price.output !== 0)) {
    return undefined;
  }
  return ZERO_PRICE_WARNING;
}
