import { parseAmount } from "@halonicjs/std";
import { Field, FormRows, Input } from "@halonicjs/studio-kit";
import type { RefObject } from "react";
import { zeroPriceWarning } from "../aliases/alias-edits.ts";
import { ZERO_PRICE_WARNING } from "../aliases/alias-text.ts";
import type { PriceRow, StepProblem } from "./step-edits.ts";
import { BUDGET_HINT, currencyChangedWarning, noAliasesLine } from "./step-text.ts";
export interface BudgetFieldsProps {
  readonly prefix: { symbol: string; name: string };
  readonly fields: { readonly perRun: string; readonly monthly: string };
  readonly note: string | undefined;
  readonly problemFor: (field: StepProblem["field"]) => string | null;
  readonly onChange: (field: "perRun" | "monthly", value: string) => void;
  /** Focus goes to Per run when the fields appear after **Change**. */
  readonly focusFirst: boolean;
}

/** The two budget fields; the note that per run is higher is the description of per run. */
export function BudgetFields({
  prefix,
  fields,
  note,
  problemFor,
  onChange,
  focusFirst,
}: BudgetFieldsProps) {
  return (
    <FormRows>
      <Field label="Per run" prefix={prefix} error={problemFor("perRun")} hint={note}>
        <Input
          autoFocus={focusFirst}
          value={fields.perRun}
          onChange={(event) => onChange("perRun", event.target.value)}
        />
      </Field>
      <Field label="Per month" prefix={prefix} error={problemFor("monthly")} hint={note}>
        <Input
          value={fields.monthly}
          onChange={(event) => onChange("monthly", event.target.value)}
        />
      </Field>
      <p className="text-small text-fg-muted">{BUDGET_HINT}</p>
    </FormRows>
  );
}

export interface PriceRowFieldsProps {
  readonly rows: readonly PriceRow[];
  readonly providerName: string;
  readonly prefix: { symbol: string; name: string };
  /** Goes on the first row's Input, where focus starts. */
  readonly firstPrice: RefObject<HTMLInputElement | null>;
  readonly problemFor: (field: StepProblem["field"], alias?: string) => string | null;
  readonly onChange: (alias: string, field: "input" | "output", value: string) => void;
}

/** One row per alias with its two prices, or the line that no alias uses the provider. */
export function PriceRowFields(props: PriceRowFieldsProps) {
  const { rows, prefix, problemFor, onChange } = props;
  if (rows.length === 0) return <p>{noAliasesLine(props.providerName)}</p>;
  return rows.map((row, index) => (
    <FormRows key={row.alias}>
      <p className="font-mono">{row.alias}</p>
      <Field label="Input" prefix={prefix} error={problemFor("input", row.alias)}>
        <Input
          {...(index === 0 ? { ref: props.firstPrice } : {})}
          value={row.input}
          onChange={(event) => onChange(row.alias, "input", event.target.value)}
        />
      </Field>
      <Field label="Output" prefix={prefix} error={problemFor("output", row.alias)}>
        <Input
          value={row.output}
          onChange={(event) => onChange(row.alias, "output", event.target.value)}
        />
      </Field>
    </FormRows>
  ));
}

/** The not-blocking warnings under the prices: a changed currency, then a price of 0. */
export function stepWarnings(
  rows: readonly PriceRow[],
  situation: { currencyChanged: boolean; currency: string; providerIsLocal: boolean },
): string[] {
  const warnings: string[] = [];
  const pricesFilled = rows.some((row) => row.input.trim() !== "" || row.output.trim() !== "");
  if (situation.currencyChanged && pricesFilled) {
    warnings.push(currencyChangedWarning(situation.currency));
  }
  const zero = rows.some(
    (row) =>
      zeroPriceWarning(
        { input: parseAmount(row.input), output: parseAmount(row.output) },
        situation.providerIsLocal,
      ) !== undefined,
  );
  if (zero) warnings.push(ZERO_PRICE_WARNING);
  return warnings;
}
