// The words of the failed banners for the workspace's own config (HAL-14899): a provider a model
// names that the workspace doesn't have, and a workflow step the run can't go on from. Each says
// the CLI's two lines (`apps/cli/src/messages/run-failures.ts`, HAL-14301) with the same facts and
// the same fix; only the provider's fix is in Models rather than a file.

/** "done or approve": the events a step's transitions take, as the CLI lists them. */
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
      : `Add the provider ${provider} in Models, or change ${named.model} to a provider the workspace has.`,
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
  /** `workflow.no-transition`: worded like `validate`'s no-done-transition. */
  noTransition: (workflow: string, step: string, failure: NoTransition) => {
    const start = `${workflow} failed in the step ${step}:`;
    if (failure.guarded) {
      return `${start} its transitions for ${failure.event} all have a when that didn't pass.`;
    }
    return failure.takes.length === 0
      ? `${start} it ended with the event ${failure.event}, and it has no transition.`
      : `${start} it ended with the event ${failure.event}, but its transitions only take ${eventList.format(failure.takes)}.`;
  },
  /** The same fixes as `validate`'s no-done-transition: a transition without event takes done. */
  noTransitionFix: (failure: NoTransition) => {
    if (failure.guarded) {
      return `Add a transition for ${failure.event} without when, as the last one, so the run always has somewhere to go.`;
    }
    if (failure.event !== "done") {
      return `Add a transition with event: ${failure.event}.`;
    }
    if (failure.takes.length === 0) {
      return "Add a transition without event.";
    }
    const [only, ...more] = failure.takes;
    return only !== undefined && more.length === 0
      ? `Remove event: ${only}, or add a transition without event.`
      : "Remove their event, or add a transition without event.";
  },
  /** `workflow.task-without-agent`: the same fix as `validate`'s task-without-agent. */
  taskWithoutAgent: (workflow: string, step: string) =>
    `${workflow} failed in the step ${step}: the step names no agent.`,
  taskWithoutAgentFix: "Give it an agent (agent: <id>), or make it a wait step.",
} as const;

/** What names the missing provider: a model alias, or an agent's `provider/model` shorthand. */
export type ModelNamed = { readonly alias: string } | { readonly model: string };

/** The facts of a step that ended with an event none of its transitions took. */
export interface NoTransition {
  readonly event: string;
  readonly takes: readonly string[];
  readonly guarded: boolean;
}
