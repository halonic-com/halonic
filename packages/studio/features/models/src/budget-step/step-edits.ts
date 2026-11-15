import { err, ok, type Result } from "@halonicjs/std";
import { editYaml } from "@halonicjs/yaml";
import { editAliasPrice } from "../aliases/alias-edits.ts";
import { type BudgetFields, editBudget } from "../budget/budget-edits.ts";

/** One alias row of the step, as typed. */
export interface PriceRow {
  readonly alias: string;
  readonly input: string;
  readonly output: string;
}

/** What the step's fields hold. */
export interface StepFields {
  /** The alias rows; a row with both fields empty writes nothing. */
  readonly prices: readonly PriceRow[];
  /** The currency picked in the step. */
  readonly currency: string;
  /** The currency `workspace.yaml` has now, or the default when it names none. */
  readonly workspaceCurrency: string;
  /** The budget fields, or `undefined` to leave the budget as it is. Both empty removes it. */
  readonly budget: BudgetFields | undefined;
}

/** The text of the two files the step writes. */
export interface StepTexts {
  readonly models: string;
  readonly workspace: string;
}

/** What is wrong with a field of the step, in the words it shows under itself. */
export interface StepProblem {
  readonly field: "input" | "output" | "perRun" | "monthly" | "yaml";
  /** The alias whose price field it is, for `input` and `output`. */
  readonly alias?: string;
  readonly message: string;
}

const amountMessage = "Enter an amount, like you'd write it on a receipt.";

/**
 * Applies the step's fields to the text of `models.yaml` and `workspace.yaml`. Prices go to each
 * alias, the budget to `workspace.yaml`. A currency other than the workspace's is written as
 * `budget.currency`, which on its own is still no budget. Nothing is written when a field is wrong:
 * it comes back as the message for that field. A price row with only one price filled is wrong
 * in the empty field, so a half price is never saved.
 *
 * @example
 * editStep(texts, { prices: [{ alias: "smart", input: "3", output: "15" }], currency: "EUR", workspaceCurrency: "EUR", budget: undefined });
 */
export function editStep(texts: StepTexts, fields: StepFields): Result<StepTexts, StepProblem> {
  let models = texts.models;
  for (const row of fields.prices) {
    const next = editRow(models, row);
    if (!next.ok) return next;
    models = next.value;
  }
  const workspace = editWorkspace(texts.workspace, fields);
  return workspace.ok ? ok({ models, workspace: workspace.value }) : workspace;
}

function editRow(models: string, row: PriceRow): Result<string, StepProblem> {
  const empty = { input: row.input.trim() === "", output: row.output.trim() === "" };
  if (empty.input && empty.output) return ok(models);
  if (empty.input !== empty.output) {
    const field = empty.input ? "input" : "output";
    return err({ field, alias: row.alias, message: amountMessage });
  }
  const edited = editAliasPrice(models, row.alias, row);
  if (edited.ok) return edited;
  const { field, message } = edited.error;
  return err({
    field: field === "input" || field === "output" ? field : "yaml",
    alias: row.alias,
    message,
  });
}

function editWorkspace(workspace: string, fields: StepFields): Result<string, StepProblem> {
  let text = workspace;
  if (fields.budget !== undefined) {
    const edited = editBudget(text, fields.budget);
    if (!edited.ok) {
      const { field, message } = edited.error;
      return err({ field, message });
    }
    text = edited.value;
  }
  if (fields.currency === fields.workspaceCurrency) return ok(text);
  const edited = editYaml(text, [
    { kind: "set", path: ["budget", "currency"], value: fields.currency },
  ]);
  return edited.ok
    ? ok(edited.value.text)
    : err({ field: "yaml", message: "workspace.yaml could not be changed. Fix the file first." });
}
