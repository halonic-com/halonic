// The failures a run stops on that are the workspace's own config, not a
// bug (HAL-14301, from Nina's C340 check): a provider a model names that the
// workspace doesn't have, and a workflow step the run can't go on from. The
// engine names each in its cause; these read the facts from the cause's detail.

/** A config failure, by the reason its lines name, with the facts they need. */
export type ConfigFailure =
  | ({
      readonly reason: "unknown-provider";
      /** The provider id the model names, which has no file in `providers/`, such as "anthropic". */
      readonly provider: string;
    } & (
      | { readonly alias: string }
      /** An agent's `provider/model` shorthand, such as "mok/echo", which names no alias. */
      | { readonly model: string }
    ))
  | {
      readonly reason: "items-not-a-list";
      /** The for-each step's `items`, as the workflow file writes it, such as "{{input.topics}}". */
      readonly items: string;
      /** What it gave instead: "nothing", "text", "object", "number" or "boolean". */
      readonly gives: string;
    }
  | {
      readonly reason: "no-transition";
      /** The event the step ended with, such as "done". */
      readonly event: string;
      /** The events the step's transitions do take, in file order; empty when it has none. */
      readonly takes: readonly string[];
    }
  | { readonly reason: "task-without-agent" };

/**
 * The config failure a cause names by its code, or `undefined` for a code
 * that isn't one, or a cause without the names its facts need.
 */
export function configFailureOf(
  code: string | undefined,
  detail: Readonly<Record<string, string>>,
): ConfigFailure | undefined {
  return code === "models.no-provider"
    ? noProviderFailure(detail)
    : workflowFailureOf(code, detail);
}

/** `unknown-provider` for the alias, or else the agent's `provider/model` shorthand, that names it. */
function noProviderFailure(detail: Readonly<Record<string, string>>): ConfigFailure | undefined {
  const { provider, alias, model } = detail;
  if (provider === undefined) return undefined;
  if (alias !== undefined) return { reason: "unknown-provider", provider, alias };
  return model === undefined ? undefined : { reason: "unknown-provider", provider, model };
}

/** A workflow step the run can't go on from, by its cause's code. */
function workflowFailureOf(
  code: string | undefined,
  detail: Readonly<Record<string, string>>,
): ConfigFailure | undefined {
  switch (code) {
    case "workflow.items-not-a-list": {
      const { items, gives } = detail;
      return items === undefined || gives === undefined
        ? undefined
        : { reason: "items-not-a-list", items, gives };
    }
    case "workflow.no-transition": {
      const { event, takes } = detail;
      return event === undefined
        ? undefined
        : { reason: "no-transition", event, takes: takes === undefined ? [] : takes.split(",") };
    }
    case "workflow.task-without-agent":
      return { reason: "task-without-agent" };
    default:
      return undefined;
  }
}
