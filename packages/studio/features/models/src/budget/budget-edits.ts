import { err, ok, parseAmount, type Result } from "@halonicjs/std";
import { editYaml, readYaml, type YamlEdit } from "@halonicjs/yaml";
import { AMOUNT_ABOVE_ZERO } from "./budget-text.ts";

/** What the two budget fields hold, as typed. */
export interface BudgetFields {
  readonly perRun: string;
  readonly monthly: string;
}

/** What is wrong with a budget field, in the words it shows under itself. */
export interface BudgetProblem {
  readonly field: keyof BudgetFields | "yaml";
  readonly message: string;
}

/** The amount in a field: `undefined` when it is empty, `null` when it isn't an amount above 0. */
function amountOf(field: string): number | undefined | null {
  if (field.trim() === "") return undefined;
  const amount = parseAmount(field);
  return amount === undefined || amount <= 0 ? null : amount;
}

/**
 * Writes the budget amounts into the text of `workspace.yaml`: a filled field sets its amount, an
 * empty one removes it, and the currency stays as it is. Both empty removes the budget, and the
 * `budget` block with it unless it has a currency. A field that
 * isn't an amount above 0 writes nothing and comes back as the message for the field.
 *
 * @example
 * editBudget(text, { perRun: "5", monthly: "50,00" });
 */
export function editBudget(text: string, fields: BudgetFields): Result<string, BudgetProblem> {
  const perRun = amountOf(fields.perRun);
  const monthly = amountOf(fields.monthly);
  if (perRun === null) return err({ field: "perRun", message: AMOUNT_ABOVE_ZERO });
  if (monthly === null) return err({ field: "monthly", message: AMOUNT_ABOVE_ZERO });
  const edited = editYaml(text, [amountEdit("perRun", perRun), amountEdit("monthly", monthly)]);
  if (!edited.ok) return err(yamlProblem);
  if (perRun !== undefined || monthly !== undefined || hasCurrency(edited.value.text)) {
    return ok(edited.value.text);
  }
  const removed = editYaml(edited.value.text, [{ kind: "delete", path: ["budget"] }]);
  return removed.ok ? ok(removed.value.text) : err(yamlProblem);
}

const yamlProblem: BudgetProblem = {
  field: "yaml",
  message: "workspace.yaml could not be changed. Fix the file first.",
};

/** Whether `budget` in the text names a currency, so it is worth keeping with no amounts. */
function hasCurrency(text: string): boolean {
  const read = readYaml(text);
  const data = read.ok ? (read.value.data as { budget?: { currency?: unknown } } | null) : null;
  return data?.budget?.currency !== undefined;
}

function amountEdit(name: string, amount: number | undefined): YamlEdit {
  return amount === undefined
    ? { kind: "delete", path: ["budget", name] }
    : { kind: "set", path: ["budget", name], value: amount };
}
