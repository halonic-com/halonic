import { parseAmount } from "@halonicjs/std";
import { Button, Dialog, Disclosure, Field, Select } from "@halonicjs/studio-kit";
import { useEffect, useRef, useState } from "react";
import { currencyPrefix } from "../aliases/alias-text.ts";
import type { ModelsFiles } from "../api.ts";
import { PER_RUN_ABOVE_MONTHLY } from "../budget/budget-text.ts";
import { editStep, type PriceRow, type StepProblem } from "./step-edits.ts";
import { BudgetFields, PriceRowFields, stepWarnings } from "./step-parts.tsx";
import {
  BUDGET_DETAILS,
  BUDGET_HEADING_STEP,
  budgetLine,
  CHANGE_STEP_BUDGET,
  CURRENCY_LABEL,
  DECIDE_LATER,
  HONEST_LINE,
  HOW_THE_BUDGET_WORKS,
  PRICES_HEADING,
  PRICES_HINT,
  SAVE_BUDGET_STEP,
  SAVE_PRICES,
  SAVING,
  STEP_NOT_SAVED,
  stepSavedLabel,
  stepTitle,
} from "./step-text.ts";

/** The currencies the step offers besides the workspace's own. */
const CURRENCIES = ["EUR", "USD", "GBP", "CHF"] as const;

/** The props of {@link PricesBudgetDialog}. */
export interface PricesBudgetDialogProps {
  readonly files: ModelsFiles;
  /** What the provider is called, as its page names it. */
  readonly providerName: string;
  /** `full` asks for the budget too; `narrowed` shows the budget it has, with **Change**. */
  readonly kind: "full" | "narrowed";
  /** The aliases to price, sorted by name: all of the provider's, or only those with no price when narrowed. */
  readonly aliases: readonly string[];
  /** The workspace's budget currency, or the default when it names none. */
  readonly currency: string;
  /** The budget the workspace has, for the narrowed step. */
  readonly budget?: { readonly perRun?: number | undefined; readonly monthly?: number | undefined };
  /** Whether the provider is on this computer, where a price of 0 is right. */
  readonly providerIsLocal: boolean;
  /** Closes the step; `wrote` says a file was changed. */
  readonly onClose: (wrote: boolean) => void;
  readonly returnFocus?: () => HTMLElement | null;
}

/**
 * The Prices and budget step (`models.budget-step.ask-for-pay-per-use`): a price row per alias, the
 * currency, and the budget fields. **Save budget** reads **Save prices** while both budget fields
 * are empty. It stays pressable with a wrong field: every wrong field says why at once and focus
 * goes to the first. With every field empty it writes nothing and closes, like **Decide later**.
 * Prices and budget are written as one undo step per file.
 *
 * @example
 * <PricesBudgetDialog files={files} providerName="Anthropic" kind="full" aliases={["fast"]} currency="EUR" providerIsLocal={false} onClose={close} />
 */
export function PricesBudgetDialog(props: PricesBudgetDialogProps) {
  const { files, providerName, kind, aliases, currency: workspaceCurrency, budget } = props;
  const [rows, setRows] = useState<readonly PriceRow[]>(
    aliases.map((alias) => ({ alias, input: "", output: "" })),
  );
  const [currency, setCurrency] = useState(workspaceCurrency);
  const [fields, setFields] = useState({ perRun: "", monthly: "" });
  const [changingBudget, setChangingBudget] = useState(false);
  const [problems, setProblems] = useState<readonly StepProblem[]>([]);
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLDivElement>(null);
  const firstPrice = useRef<HTMLInputElement>(null);
  const showBudgetFields = kind === "full" || changingBudget;
  const budgetFilled =
    showBudgetFields && (fields.perRun.trim() !== "" || fields.monthly.trim() !== "");

  /** Focus starts on the first price row, though the currency comes before it in the order. */
  useEffect(() => firstPrice.current?.focus(), []);

  async function save() {
    setFailure(undefined);
    setBusy(true);
    try {
      const [models, workspace] = await Promise.all([files.readModels(), files.readWorkspace()]);
      if (models === null || workspace === null) {
        setFailure(STEP_NOT_SAVED);
        setBusy(false);
        return;
      }
      const edited = editStep(
        { models, workspace },
        {
          prices: rows,
          currency,
          workspaceCurrency,
          budget: showBudgetFields ? fields : undefined,
        },
      );
      if (!edited.ok) {
        setProblems(edited.error);
        setBusy(false);
        form.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
        return;
      }
      const label = stepSavedLabel(providerName);
      if (edited.value.models !== models) files.changeModels(label, edited.value.models);
      if (edited.value.workspace !== workspace)
        files.changeWorkspace(label, edited.value.workspace);
      props.onClose(edited.value.models !== models || edited.value.workspace !== workspace);
    } catch {
      setFailure(STEP_NOT_SAVED);
      setBusy(false);
    }
  }

  const problemFor = (field: StepProblem["field"], alias?: string) =>
    problems.find((problem) => problem.field === field && problem.alias === alias)?.message ?? null;
  const clear = (field: StepProblem["field"], alias?: string) =>
    setProblems(problems.filter((p) => !(p.field === field && p.alias === alias)));
  const setRow = (alias: string, field: "input" | "output", value: string) => {
    setRows(rows.map((row) => (row.alias === alias ? { ...row, [field]: value } : row)));
    clear(field, alias);
  };
  const setBudgetField = (field: "perRun" | "monthly", value: string) => {
    setFields({ ...fields, [field]: value });
    clear(field);
  };
  const prefix = currencyPrefix(currency);
  const higher = (parseAmount(fields.perRun) ?? 0) > (parseAmount(fields.monthly) ?? Infinity);
  const warnings = stepWarnings(rows, {
    currencyChanged: currency !== workspaceCurrency,
    currency,
    providerIsLocal: props.providerIsLocal,
  });

  return (
    <Dialog
      title={stepTitle(providerName)}
      size="md"
      form
      confirm={{ label: budgetFilled ? SAVE_BUDGET_STEP : SAVE_PRICES, busyLabel: SAVING }}
      cancelLabel={DECIDE_LATER}
      busy={busy}
      {...(failure === undefined ? {} : { error: failure })}
      onConfirm={() => void save()}
      onCancel={() => props.onClose(false)}
      {...(props.returnFocus === undefined ? {} : { returnFocus: props.returnFocus })}
    >
      <div ref={form} className="flex flex-col gap-4">
        <section className="flex flex-col gap-2">
          <h3 className="text-heading">{PRICES_HEADING}</h3>
          <Field label={CURRENCY_LABEL}>
            <Select
              options={[...new Set([workspaceCurrency, ...CURRENCIES])].map((code) => ({
                value: code,
                label: code,
              }))}
              value={currency}
              onChange={setCurrency}
            />
          </Field>
          <PriceRowFields
            rows={rows}
            providerName={providerName}
            prefix={prefix}
            firstPrice={firstPrice}
            problemFor={problemFor}
            onChange={setRow}
          />
          <p className="text-small text-fg-muted">{PRICES_HINT}</p>
          {warnings.length > 0 ? (
            <div role="status">
              {warnings.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          ) : null}
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="text-heading">{BUDGET_HEADING_STEP}</h3>
          {kind === "narrowed" && !changingBudget ? (
            <p className="flex items-center gap-2">
              {budgetLine(budget ?? {}, currency)}
              <Button variant="secondary" onClick={() => setChangingBudget(true)}>
                {CHANGE_STEP_BUDGET}
              </Button>
            </p>
          ) : (
            <BudgetFields
              prefix={prefix}
              fields={fields}
              note={higher ? PER_RUN_ABOVE_MONTHLY : undefined}
              problemFor={problemFor}
              onChange={setBudgetField}
              focusFirst={changingBudget}
            />
          )}
          <p className="text-small text-fg-muted">{HONEST_LINE}</p>
          <Disclosure summary={HOW_THE_BUDGET_WORKS}>
            <ul className="flex flex-col gap-1 px-4 py-2">
              {BUDGET_DETAILS.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </Disclosure>
        </section>
      </div>
    </Dialog>
  );
}
