import { parseFile } from "@halonicjs/format";
import { err, ok, parseAmount, type Result } from "@halonicjs/std";
import { editYaml, type YamlEdit } from "@halonicjs/yaml";
import { AMOUNT_MESSAGE, ZERO_PRICE_WARNING } from "./alias-text.ts";

/** What is wrong with a field, in the words the field shows under itself. */
export interface FieldProblem {
  readonly field: "name" | "provider" | "model" | "fallbacks" | "input" | "output" | "yaml";
  readonly message: string;
}

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

/** The names of the aliases `models.yaml` lists, or `undefined` when the text doesn't read as one. */
function aliasNames(text: string): string[] | undefined {
  const parsed = parseFile("models", text);
  return parsed.ok ? Object.keys(parsed.value.value.aliases) : undefined;
}

const unreadable: FieldProblem = {
  field: "yaml",
  message: "models.yaml could not be changed. Fix the file first.",
};

/**
 * Saves the comma-separated alias names of the "Fallbacks" field as the alias's `fallback` list.
 * A name that is not an alias writes nothing and is named in the field's message.
 */
export function editAliasFallbacks(
  text: string,
  alias: string,
  field: string,
): Result<string, FieldProblem> {
  const fallbacks = parseFallbacks(field);
  const known = aliasNames(text);
  const unknown = fallbacks.find((name) => known !== undefined && !known.includes(name));
  if (unknown !== undefined) {
    return err({
      field: "fallbacks",
      message: `There's no model alias called ${unknown}. Pick one from the list.`,
    });
  }
  return applyEdits(text, [
    { kind: "set", path: ["aliases", alias, "fallback"], value: fallbacks },
  ]);
}

/**
 * Adds an alias that points at a provider and model. A name that is empty, taken or has a `/` (a
 * name with one reads as provider/model, so the alias could never be used), an empty or invalid provider, or an empty model,
 * writes nothing and comes back as the message for its field.
 *
 * @param text - the text of `models.yaml`
 */
export function addAlias(
  text: string,
  name: string,
  target: { readonly provider: string; readonly model: string },
): Result<string, FieldProblem> {
  const alias = name.trim();
  const model = target.model.trim();
  if (alias === "") return err({ field: "name", message: "Give it a name." });
  if (alias.includes("/")) {
    return err({
      field: "name",
      message:
        "A name can't contain /. Halonic reads provider/model names as a provider and a model.",
    });
  }
  const known = aliasNames(text);
  if (known === undefined) return err(unreadable);
  if (known.includes(alias)) {
    return err({ field: "name", message: `There's already a model alias called ${alias}.` });
  }
  const provider = target.provider.trim();
  if (provider === "") return err({ field: "provider", message: "Pick a provider." });
  if (!/^[a-z0-9_-]+$/.test(provider)) {
    return err({
      field: "provider",
      message: "A provider's name uses lowercase letters, digits, - and _.",
    });
  }
  if (model === "") {
    return err({ field: "model", message: "Give the model's name, like claude-sonnet-5-5." });
  }
  const added = applyEdits(text, [
    { kind: "set", path: ["aliases", alias, "provider"], value: provider },
    { kind: "set", path: ["aliases", alias, "model"], value: model },
  ]);
  // A last check that what is saved is a file the Studio can read back.
  if (added.ok && aliasNames(added.value) === undefined) return err(unreadable);
  return added;
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
    return err({ field: "input", message: AMOUNT_MESSAGE });
  }
  const output = parseAmount(fields.output);
  if (output === undefined && !outputEmpty) {
    return err({ field: "output", message: AMOUNT_MESSAGE });
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
