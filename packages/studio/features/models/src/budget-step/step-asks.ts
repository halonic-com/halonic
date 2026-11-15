import type { Provider } from "@halonicjs/format";
import { isPayPerUse, providerHost } from "@halonicjs/workspace";

/** The parts of a provider the step's rules read. */
type StepProvider = Pick<Provider, "type" | "baseUrl" | "secret" | "options">;

/** The step to show: with the budget part, only the prices, or none. */
export type StepKind = "full" | "narrowed" | "none";

/** What the step's rules need to know. */
export interface StepSituation {
  readonly provider: StepProvider;
  /** Whether the workspace has a budget (`hasBudget`). */
  readonly hasBudget: boolean;
  /** How many aliases on the provider have no price. */
  readonly unpricedAliases: number;
  /** Whether "No limit" is remembered for this workspace, provider and host. */
  readonly noLimitRemembered: boolean;
}

/**
 * Which step to offer for a provider (flow-models 4.1). A provider that can't bill per use gets
 * none, which covers a provider on this computer with no cost. A remembered "No limit" gets none.
 * With no budget the whole step is offered; with a budget only the prices, and only while an alias
 * on the provider has none.
 */
export function stepToAsk(situation: StepSituation): StepKind {
  if (!isPayPerUse(situation.provider) || situation.noLimitRemembered) return "none";
  if (!situation.hasBudget) return "full";
  return situation.unpricedAliases > 0 ? "narrowed" : "none";
}

/**
 * Whether an edit made the provider pay-per-use, or moved a pay-per-use provider to another host
 * (trigger (a)): "No limit" is remembered per host, so a new host asks again.
 */
export function becamePayPerUse(before: StepProvider | undefined, after: StepProvider): boolean {
  if (!isPayPerUse(after)) return false;
  return (
    before === undefined || !isPayPerUse(before) || providerHost(before) !== providerHost(after)
  );
}
