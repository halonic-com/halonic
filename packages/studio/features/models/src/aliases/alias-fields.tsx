import type { ModelAlias, Models } from "@halonicjs/format";
import type { Result } from "@halonicjs/std";
import { Field, FormRows, Input, Select } from "@halonicjs/studio-kit";
import { useState } from "react";
import type { ModelsFiles } from "../api.ts";
import {
  editAliasFallbacks,
  editAliasPrice,
  editAliasTarget,
  type FieldProblem,
  parseFallbacks,
} from "./alias-edits.ts";
import { saveModelsEdit } from "./alias-save.ts";
import {
  aliasUpdatedLine,
  CACHE_PRICES_NOTE,
  fallbacksHint,
  PRICE_HEADING,
  PRICE_HINT,
} from "./alias-text.ts";
import { useDraft } from "./use-draft.ts";

/** The props of {@link AliasFields}. */
export interface AliasFieldsProps {
  readonly files: ModelsFiles;
  readonly models: Models;
  readonly name: string;
}

const EURO = { symbol: "€", name: "in euros" };

const priceText = (amount: number | undefined) => (amount === undefined ? "" : String(amount));

const fallbacksChanged = (alias: ModelAlias, field: string) =>
  parseFallbacks(field).join("\n") !== (alias.fallback ?? []).join("\n");

function hasCachePrices(alias: ModelAlias): boolean {
  const price = alias.price;
  return (
    price?.cacheRead !== undefined ||
    price?.cacheWrite !== undefined ||
    price?.cacheWrite1h !== undefined
  );
}

/**
 * The editable fields of an alias tab (`models.aliases.edit-target`, `.edit-fallbacks`,
 * `.edit-price`): provider, model, fallbacks and the two prices. Each change is saved when the
 * field is left (the provider when it is picked), and the status line says so.
 *
 * @example
 * <AliasFields files={files} models={models} name="smart" />
 */
export function AliasFields({ files, models, name }: AliasFieldsProps) {
  const alias = models.aliases[name];
  const [problem, setProblem] = useState<FieldProblem>();
  const [status, setStatus] = useState("");
  const [model, setModel] = useDraft(alias?.model ?? "");
  const [fallbacks, setFallbacks] = useDraft((alias?.fallback ?? []).join(", "));
  const [input, setInput] = useDraft(priceText(alias?.price?.input));
  const [output, setOutput] = useDraft(priceText(alias?.price?.output));
  if (alias === undefined) return null;

  const save = async (edit: (text: string) => Result<string, FieldProblem>) => {
    const { problem: found, wrote } = await saveModelsEdit(files, aliasUpdatedLine(name), edit);
    setProblem(found);
    if (found !== undefined) setStatus("");
    else if (wrote) setStatus(aliasUpdatedLine(name));
  };
  const saveTarget = (provider: string, modelName: string) =>
    save((text) => editAliasTarget(text, name, { provider, model: modelName }, alias.model));
  const saveFallbacks = () =>
    fallbacksChanged(alias, fallbacks)
      ? save((text) => editAliasFallbacks(text, name, fallbacks))
      : undefined;
  const savePrices = () => save((text) => editAliasPrice(text, name, { input, output }));
  const problemFor = (field: FieldProblem["field"]) =>
    problem?.field === field ? problem.message : null;

  const otherAliases = Object.keys(models.aliases)
    .filter((other) => other !== name)
    .sort((first, second) => first.localeCompare(second));
  const providers = [
    ...new Set([alias.provider, ...Object.values(models.aliases).map((other) => other.provider)]),
  ];
  const emptiesCachePrices = input.trim() === "" && output.trim() === "" && hasCachePrices(alias);

  return (
    <div className="flex flex-col gap-4">
      <FormRows>
        <Field label="Provider">
          <Select
            options={providers.map((provider) => ({ value: provider, label: provider }))}
            value={alias.provider}
            onChange={(provider) => void saveTarget(provider, alias.model)}
          />
        </Field>
        <Field label="Model" error={problemFor("model")}>
          <Input
            value={model}
            onChange={(event) => setModel(event.target.value)}
            onBlur={() => model !== alias.model && void saveTarget(alias.provider, model)}
          />
        </Field>
        <Field label="Fallbacks" hint={fallbacksHint(otherAliases)}>
          <Input
            value={fallbacks}
            onChange={(event) => setFallbacks(event.target.value)}
            onBlur={() => void saveFallbacks()}
          />
        </Field>
      </FormRows>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-heading">{PRICE_HEADING}</legend>
        <p>{PRICE_HINT}</p>
        <div className="flex gap-4">
          <Field label="Input" prefix={EURO} error={problemFor("input")}>
            <Input
              value={input}
              inputMode="decimal"
              onChange={(event) => setInput(event.target.value)}
              onBlur={() => void savePrices()}
            />
          </Field>
          <Field label="Output" prefix={EURO} error={problemFor("output")}>
            <Input
              value={output}
              inputMode="decimal"
              onChange={(event) => setOutput(event.target.value)}
              onBlur={() => void savePrices()}
            />
          </Field>
        </div>
        {emptiesCachePrices ? <p>{CACHE_PRICES_NOTE}</p> : null}
      </fieldset>
      {problemFor("yaml") === null ? null : <p role="alert">{problemFor("yaml")}</p>}
      <p role="status">{status}</p>
    </div>
  );
}
