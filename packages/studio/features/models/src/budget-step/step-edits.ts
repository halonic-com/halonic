import { err, ok, parseAmount, type Result } from "@halonicjs/std";
import { editYaml } from "@halonicjs/yaml";
import { editAliasPrice } from "../aliases/alias-edits.ts";
import { AMOUNT_MESSAGE } from "../aliases/alias-text.ts";
import { type BudgetFields, budgetProblems, editBudget } from "../budget/budget-edits.ts";

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

/**
 * Applies the step's fields to the text of `models.yaml` and `workspace.yaml`. Prices go to each
 * alias, the budget to `workspace.yaml`. A currency other than the workspace's is written as
 * `budget.currency`, which on its own is still no budget. Nothing is written when a field is wrong:
 * every wrong field comes back with its own message, in the order of the dialog (prices, then
 * budget). A price row with only one price filled is wrong in the empty field, unless the filled
 * one isn't an amount: then that one is named, as it is wrong already.
 *
 * @example
 * editStep(texts, { prices: [{ alias: "smart", input: "3", output: "15" }], currency: "EUR", workspaceCurrency: "EUR", budget: undefined });
 */
export function editStep(
  texts: StepTexts,
  fields: StepFields,
): Result<StepTexts, readonly StepProblem[]> {
  const problems = [
    ...fields.prices.flatMap(rowProblems),
    ...(fields.budget === undefined ? [] : budgetProblems(fields.budget)),
  ];
  if (problems.length > 0) return err(problems);
  let models = texts.models;
  for (const row of fields.prices) {
    const next = editRow(models, row);
    if (!next.ok) return err([next.error]);
    models = next.value;
  }
  const workspace = editWorkspace(texts.workspace, fields);
  return workspace.ok ? ok({ models, workspace: workspace.value }) : err([workspace.error]);
}

/** The wrong fields of a price row, input first. A half row names the empty field only when the other one reads. */
function rowProblems(row: PriceRow): StepProblem[] {
  const filled = { input: row.input.trim() !== "", output: row.output.trim() !== "" };
  const wrong = (field: "input" | "output") =>
    filled[field] && parseAmount(row[field]) === undefined;
  const problems: StepProblem[] = (["input", "output"] as const)
    .filter(wrong)
    .map((field) => ({ field, alias: row.alias, message: AMOUNT_MESSAGE }));
  if (problems.length === 0 && filled.input !== filled.output) {
    const field = filled.input ? "output" : "input";
    problems.push({ field, alias: row.alias, message: AMOUNT_MESSAGE });
  }
  return problems;
}

/** Writes a row whose fields already read: both empty writes nothing. */
function editRow(models: string, row: PriceRow): Result<string, StepProblem> {
  if (row.input.trim() === "" && row.output.trim() === "") return ok(models);
  const edited = editAliasPrice(models, row.alias, row);
  if (edited.ok) return edited;
  return err({ field: "yaml", alias: row.alias, message: edited.error.message });
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
