import { parseAmount } from "@halonicjs/std";
import { Button, Dialog, Disclosure, Field, Select } from "@halonicjs/studio-kit";
import { useEffect, useRef, useState } from "react";
import { currencyPrefix } from "../aliases/alias-text.ts";
import type { ModelsFiles } from "../api.ts";
import { PER_RUN_ABOVE_MONTHLY } from "../budget/budget-text.ts";
import { editStep, type PriceRow, type StepProblem, type StepTexts } from "./step-edits.ts";
import { PriceRowFields, StepBudgetFields, stepWarnings } from "./step-parts.tsx";
import {
  BUDGET_DETAILS,
  BUDGET_HEADING_STEP,
  budgetLine,
  CHANGE_STEP_BUDGET,
  CURRENCY_LABEL,
  DECIDE_LATER,
  HONEST_LINE,
  HOW_THE_BUDGET_WORKS,
  NO_LIMIT,
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
  /**
   * Remembers "No limit" for this workspace, provider and host on this device. Without it the full
   * step has no **No limit** button.
   */
  readonly onNoLimit?: () => void;
  /** Closes the step; `wrote` says a file was changed. */
  readonly onClose: (wrote: boolean) => void;
  readonly returnFocus?: () => HTMLElement | null;
}

/** Changes the files whose text differs, one undo step each; whether any did. */
function writeStep(
  files: ModelsFiles,
  label: string,
  before: StepTexts,
  after: StepTexts,
): boolean {
  if (after.models !== before.models) files.changeModels(label, after.models);
  if (after.workspace !== before.workspace) files.changeWorkspace(label, after.workspace);
  return after.models !== before.models || after.workspace !== before.workspace;
}

/**
 * The Prices and budget step (`models.budget-step.ask-for-pay-per-use`): a price row per alias, the
 * currency, and the budget fields. **Save budget** reads **Save prices** while both budget fields
 * are empty. It stays pressable with a wrong field: every wrong field says why at once and focus
 * goes to the first. With every field empty it writes nothing and closes, like **Decide later**.
 * Prices and budget are written as one undo step per file. In the narrowed step **Change** starts
 * the fields at the budget the workspace has; emptying both removes it, as on the budget page.
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
  const [failedSaves, setFailedSaves] = useState(0);
  const form = useRef<HTMLDivElement>(null);
  const firstPrice = useRef<HTMLInputElement>(null);
  const showBudgetFields = kind === "full" || changingBudget;
  const budgetFilled =
    showBudgetFields && (fields.perRun.trim() !== "" || fields.monthly.trim() !== "");

  /** Focus starts on the first price row, though the currency comes before it in the order. */
  useEffect(() => firstPrice.current?.focus(), []);

  /** Focus goes to the first wrong field once it is marked, which is after the render. */
  useEffect(() => {
    if (failedSaves > 0) form.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
  }, [failedSaves]);

  /** **Change** fills the fields from the budget, so saving without a touch keeps it. */
  function changeBudget() {
    setFields({
      perRun: budget?.perRun === undefined ? "" : String(budget.perRun),
      monthly: budget?.monthly === undefined ? "" : String(budget.monthly),
    });
    setChangingBudget(true);
  }

  /** Writes the fields. **No limit** writes the prices only, then remembers the answer. */
  async function save(noLimit = false) {
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
          budget: showBudgetFields && !noLimit ? fields : undefined,
        },
      );
      if (!edited.ok) {
        setProblems(edited.error);
        setFailedSaves((count) => count + 1);
        setBusy(false);
        return;
      }
      const wrote = writeStep(
        files,
        stepSavedLabel(providerName),
        { models, workspace },
        edited.value,
      );
      if (noLimit) props.onNoLimit?.();
      props.onClose(wrote);
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
      {...(kind === "full" && props.onNoLimit !== undefined
        ? { alternative: { label: NO_LIMIT, onClick: () => void save(true) } }
        : {})}
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
          <div role="status">
            {warnings.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="text-heading">{BUDGET_HEADING_STEP}</h3>
          {kind === "narrowed" && !changingBudget ? (
            <p className="flex items-center gap-2">
              {budgetLine(budget ?? {}, currency)}
              <Button variant="secondary" onClick={changeBudget}>
                {CHANGE_STEP_BUDGET}
              </Button>
            </p>
          ) : (
            <StepBudgetFields
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
