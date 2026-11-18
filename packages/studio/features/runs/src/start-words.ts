// How the Runs feature's empty lines say to start a run: on Home's Recent runs and under the Runs
// list's "No runs yet" (HAL-10128, HAL-12371).

import type { RunnableWorkflow } from "./api.ts";

/**
 * The command the empty lines show: `halonic run support-reply` with the first workflow's name,
 * and `halonic run` while the names aren't known (HAL-10128).
 */
export function runCommand(workflows: readonly RunnableWorkflow[] | undefined): string {
  const [first] = workflows ?? [];
  return first === undefined ? "halonic run" : `halonic run ${first.command}`;
}

/**
 * How the empty lines say to start a run where a workflow's page has **Run** (HAL-12371): the
 * first workflow's name, a link that opens it, then the button. While the names aren't known
 * it says "a workflow"; with none, `noWorkflow` sends the user to Workflows.
 */
export const pressRunWords = {
  open: "To start one, open ",
  aWorkflow: "a workflow",
  inWorkflows: " in Workflows and press ",
  run: "Run",
  end: ".",
  /** The parts around **Run**, which shows in bold. */
  noWorkflow: ["This workspace has no workflows yet. Add one in Workflows, then press ", " on it."],
} as const;
