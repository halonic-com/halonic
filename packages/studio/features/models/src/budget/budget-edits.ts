import { err, ok, parseAmount, type Result } from "@halonicjs/std";
import { editYaml, type YamlEdit } from "@halonicjs/yaml";
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
 * empty one removes it, and the currency stays as it is. Both empty removes the budget. A field that
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
  return edited.ok
    ? ok(edited.value.text)
    : err({ field: "yaml", message: "workspace.yaml could not be changed. Fix the file first." });
}

function amountEdit(name: string, amount: number | undefined): YamlEdit {
  return amount === undefined
    ? { kind: "delete", path: ["budget", name] }
    : { kind: "set", path: ["budget", name], value: amount };
}
