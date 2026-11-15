import { parseAmount } from "@halonicjs/std";
import { Button, Field, FormRows, Input, useToastStore } from "@halonicjs/studio-kit";
import { useEffect, useRef, useState } from "react";
import type { ModelsFiles } from "../api.ts";
import { type BudgetFields, type BudgetProblem, editBudget } from "./budget-edits.ts";
import {
  budgetSetTitle,
  budgetSummary,
  CANCEL_BUDGET,
  currencyAffix,
  PER_RUN_ABOVE_MONTHLY,
  REMOVE_BUDGET,
  REMOVED_BUDGET_TITLE,
  SAVE_BUDGET,
  UNDO,
  UNDONE_BUDGET_TITLE,
} from "./budget-text.ts";

/** The props of {@link BudgetEditor}. */
export interface BudgetEditorProps {
  readonly files: ModelsFiles;
  readonly currency: string;
  /** The amounts the fields start with, as the file has them. */
  readonly initial: { readonly perRun?: number | undefined; readonly monthly?: number | undefined };
  /** Closes the editor; `wrote` says the file was changed. */
  readonly onClose: (wrote: boolean) => void;
}

/**
 * The two budget fields in place, with focus on Per run. **Save** writes `workspace.yaml` as one
 * undo step and shows a toast with **Undo**; with both fields empty it reads **Remove budget**.
 * An amount that isn't above 0 writes nothing and is named under its field.
 *
 * @example
 * <BudgetEditor files={files} currency="EUR" initial={{ monthly: 50 }} onClose={close} />
 */
export function BudgetEditor({ files, currency, initial, onClose }: BudgetEditorProps) {
  const toasts = useToastStore();
  const perRunInput = useRef<HTMLInputElement>(null);
  const [fields, setFields] = useState<BudgetFields>({
    perRun: initial.perRun === undefined ? "" : String(initial.perRun),
    monthly: initial.monthly === undefined ? "" : String(initial.monthly),
  });
  const [problem, setProblem] = useState<BudgetProblem>();
  useEffect(() => perRunInput.current?.focus(), []);
  const emptied = fields.perRun.trim() === "" && fields.monthly.trim() === "";
  const affix = currencyAffix(currency);

  const save = async () => {
    const text = await files.readWorkspace();
    if (text === null) {
      setProblem({ field: "yaml", message: "workspace.yaml could not be found." });
      return;
    }
    const edited = editBudget(text, fields);
    if (!edited.ok) {
      setProblem(edited.error);
      return;
    }
    const written = edited.value;
    if (written !== text) {
      const amounts = { perRun: parseAmount(fields.perRun), monthly: parseAmount(fields.monthly) };
      const title = emptied
        ? REMOVED_BUDGET_TITLE
        : budgetSetTitle(budgetSummary(amounts, currency));
      files.changeWorkspace(title, written);
      toasts?.show({
        tone: "success",
        title,
        action: { label: UNDO, onClick: () => void undo(text, written) },
      });
    }
    onClose(written !== text);
  };

  /** Puts the old text back as a step of its own, unless `workspace.yaml` changed since. */
  const undo = async (before: string, written: string) => {
    if ((await files.readWorkspace()) === written) {
      files.changeWorkspace(UNDONE_BUDGET_TITLE, before);
    }
  };

  const problemFor = (field: keyof BudgetFields) =>
    problem?.field === field ? problem.message : null;
  const change = (field: keyof BudgetFields, value: string) => {
    setFields({ ...fields, [field]: value });
    if (problem?.field === field) setProblem(undefined);
  };
  const higher = (parseAmount(fields.perRun) ?? 0) > (parseAmount(fields.monthly) ?? Infinity);
  const note = higher ? PER_RUN_ABOVE_MONTHLY : undefined;

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <FormRows>
        <Field label="Per run" prefix={affix} error={problemFor("perRun")} hint={note}>
          <Input
            ref={perRunInput}
            value={fields.perRun}
            onChange={(event) => change("perRun", event.target.value)}
          />
        </Field>
        <Field label="Per month" prefix={affix} error={problemFor("monthly")}>
          <Input
            value={fields.monthly}
            onChange={(event) => change("monthly", event.target.value)}
          />
        </Field>
      </FormRows>
      {problem?.field === "yaml" ? <p role="alert">{problem.message}</p> : null}
      <div className="flex gap-2">
        <Button type="submit">{emptied ? REMOVE_BUDGET : SAVE_BUDGET}</Button>
        <Button variant="secondary" onClick={() => onClose(false)}>
          {CANCEL_BUDGET}
        </Button>
      </div>
    </form>
  );
}
