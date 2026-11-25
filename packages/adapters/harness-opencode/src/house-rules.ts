import type { HarnessTask } from "@halonicjs/ports";

/**
 * The house rules every OpenCode writer reads before its task (requirement
 * `harness-opencode.house-rules`).
 *
 * The text is the Variant lab's V53 block word for word: the trial gains were
 * measured on this exact wording, so change it only with a new trial. It is
 * information, never a block: no file is made read-only (that cost points in
 * the trial).
 */
export const houseRulesText = [
  "HOUSE RULES (read first):",
  "1. Do not edit, weaken or delete existing tests. Add new tests for new behaviour instead.",
  "2. Do not change existing user-facing wording or requirements unless the task explicitly asks for that change.",
  "3. Reuse the repository's existing names, error classes and helpers; do not invent parallel ones.",
  "4. Keep the change to what the task asks.",
].join("\n");

/** The prompt OpenCode gets: the house rules, a blank line, then the task's prompt unchanged. */
export function withHouseRules(prompt: string): string {
  return `${houseRulesText}\n\n${prompt}`;
}

/**
 * What OpenCode reads on standard input for `task`: the prompt with the
 * house rules when the task asks for them, and the prompt unchanged when it
 * doesn't, so an agent that isn't a coding writer never reads them.
 */
export function opencodePrompt(task: Pick<HarnessTask, "prompt" | "houseRules">): string {
  return task.houseRules === true ? withHouseRules(task.prompt) : task.prompt;
}
