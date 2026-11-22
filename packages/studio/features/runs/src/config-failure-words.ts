// The words of the failed banners for the workspace's own config (HAL-14899): a provider a model
// names that the workspace doesn't have, and a workflow step the run can't go on from. Each says
// the CLI's two lines (`apps/cli/src/messages/run-failures.ts`, HAL-14301) with the same facts and
// the same fix, in Studio's words rather than the file's (C617): an arrow, not a transition, and
// the arrow card's On event and Condition, the card **See the step** opens.

/** "done or approve": the events a step's arrows are on, as the CLI lists them. */
const eventList = new Intl.ListFormat("en-GB", { type: "disjunction" });

/** "a text", "an object", "a number". */
function aKind(kind: string): string {
  return kind === "object" ? "an object" : `a ${kind}`;
}

/** The path of items that are one placeholder and nothing else, such as "input.topics". */
function placeholderPath(items: string): string | undefined {
  return /^\{\{\s*([^{}\s]+)\s*\}\}$/.exec(items.trim())?.[1];
}

export const configFailureWords = {
  /** `models.no-provider`: an alias names it, or else an agent's `provider/model` shorthand. */
  unknownProvider: (workflow: string, step: string, provider: string, named: ModelNamed) =>
    `${workflow} failed in the step ${step}: ${"alias" in named ? `the model alias ${named.alias}` : `the model ${named.model}`} names the provider ${provider}, which the workspace doesn't have.`,
  unknownProviderFix: (provider: string, named: ModelNamed) =>
    "alias" in named
      ? `Add the provider ${provider} in Models, or point the model alias ${named.alias} at a provider the workspace has.`
      : `Add the provider ${provider} in Models, or give the agent a model from a provider the workspace has.`,
  /** `workflow.items-not-a-list`: Nina's C340 wording, with the template the step wrote. */
  itemsNotAList: (workflow: string, step: string, items: string, gives: string) =>
    gives === "nothing"
      ? `${workflow} failed in the step ${step}: its items (${items}) give nothing.`
      : `${workflow} failed in the step ${step}: its items (${items}) are ${aKind(gives)}, not a list.`,
  /** The same fixes as `validate`'s items-not-a-list; only a list from the run's input or context is left to the run. */
  itemsNotAListFix: (items: string, gives: string) => {
    const path = placeholderPath(items);
    if (path === undefined) {
      return `Write one placeholder, such as "{{context.topics}}".`;
    }
    if (!/^(input|context)\./.test(path)) {
      return `Read the list from input or context, such as "{{context.${path}}}".`;
    }
    return gives === "nothing"
      ? `Check the name in ${items}, and pass a JSON list there, such as ["Monday", "Tuesday"].`
      : `Pass a JSON list, such as ["Monday", "Tuesday"].`;
  },
  /** `workflow.no-transition`: `validate`'s no-done-transition, with arrows and their conditions. */
  noTransition: (workflow: string, step: string, failure: NoTransition) => {
    const start = `${workflow} failed in the step ${step}:`;
    if (failure.guarded) {
      return `${start} its arrows on ${failure.event} all have a condition that didn't match.`;
    }
    return failure.takes.length === 0
      ? `${start} it ended with the event ${failure.event}, and it has no arrows.`
      : `${start} it ended with the event ${failure.event}, but its arrows are only on ${eventList.format(failure.takes)}.`;
  },
  /**
   * `validate`'s no-done-transition fixes, said on the arrow card: an arrow whose On event is empty
   * shows done, and an arrow with no condition always matches.
   */
  noTransitionFix: (failure: NoTransition) => {
    if (failure.guarded) {
      return `Add an arrow on ${failure.event} with no condition, as the last one, so the run always has somewhere to go.`;
    }
    if (failure.event !== "done") {
      return `Add an arrow on ${failure.event}.`;
    }
    if (failure.takes.length === 0) {
      // The Problems row's own fix for a step with no arrows (9.3).
      return "Add an arrow from it on its card.";
    }
    const [only, ...more] = failure.takes;
    return only !== undefined && more.length === 0
      ? `Change the On event of the arrow on ${only} to ${failure.event}, or add an arrow on ${failure.event}.`
      : `Change one arrow's On event to ${failure.event}, or add an arrow on ${failure.event}.`;
  },
  /** `workflow.task-without-agent`: the card's Agent field is what `agent:` sets in the file. */
  taskWithoutAgent: (workflow: string, step: string) =>
    `${workflow} failed in the step ${step}: it's an agent step with no agent.`,
  taskWithoutAgentFix: "Pick an agent on its card, or make it a wait step.",
  /** `workflow.item-run-waits`: the CLI's words, after C613's for `validate`'s foreach-child-waits. */
  itemRunWaits: (workflow: string, step: string, item: number) =>
    `${workflow} failed in the step ${step}: the run it started for item ${item + 1} waited, and a run for one item can't wait.`,
  itemRunWaitsFix: (step: string, itemWorkflow: string) =>
    `Move the wait step in ${itemWorkflow} into this workflow after ${step}, or take it out of ${itemWorkflow}.`,
} as const;

/** What names the missing provider: a model alias, or an agent's `provider/model` shorthand. */
export type ModelNamed = { readonly alias: string } | { readonly model: string };

/** The facts of a step that ended with an event none of its arrows are on. */
export interface NoTransition {
  readonly event: string;
  readonly takes: readonly string[];
  readonly guarded: boolean;
}
