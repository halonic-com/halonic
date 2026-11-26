import { inlineLinkClasses } from "@halonicjs/studio-kit";
import type { AgentHarnessId, AliasCost, AliasSummary } from "../api.ts";
import { configurationWords as words } from "./configuration-words.ts";

/** Opens an alias's tab on Models, with its price field focused when `focusPrice` is set. */
export type OpenAlias = (name: string, options?: { readonly focusPrice?: boolean }) => void;

/** Props for {@link AliasLine}. */
export interface AliasLineProps {
  readonly alias: string;
  readonly summary: AliasSummary;
  /** The program the agent runs in: on Claude Code and Codex the line says whose subscription pays. */
  readonly harness: AgentHarnessId;
  /** Opens the alias on Models; absent where the window can't, which leaves the name as text. */
  readonly openAlias?: OpenAlias | undefined;
}

/**
 * The line under the Model page's picker (UX 2.5, microcopy 8.5): "**smart** · Anthropic /
 * claude-sonnet-5-5 · €3.00 in, €15.00 out per million tokens". The alias name opens its tab on
 * Models; without a price the line ends with **Add a price**, which opens it at the price. It is
 * the picker's Field hint, so the picker is described by it; the Field's line gives the size. An
 * agent on a subscription gets microcopy L3's ending instead: "On your Claude subscription, not priced".
 */
export function AliasLine({ alias, summary, harness, openAlias }: AliasLineProps) {
  return (
    <span className="text-fg-muted">
      {openAlias === undefined ? (
        <strong className="font-medium text-fg">{alias}</strong>
      ) : (
        <button
          type="button"
          className={`font-medium ${inlineLinkClasses}`}
          onClick={() => openAlias(alias)}
        >
          {alias}
        </button>
      )}
      {` · ${summary.provider} / ${summary.model} · `}
      <Cost
        cost={costOn(summary.cost, harness)}
        addPrice={openAlias && (() => openAlias(alias, { focusPrice: true }))}
      />
    </span>
  );
}

/** What the line says an alias costs: an alias's cost, or the subscription the agent runs on. */
type ShownCost = AliasCost | { readonly kind: "subscription"; readonly plan: string };

/**
 * The alias's cost, or the subscription of a Claude Code or Codex agent: Studio passes on the
 * program's own sign-in (see `harnessStrip`), so its calls are counted but not priced (HAL-2257).
 * A model on this computer and the test model still cost nothing, so they keep their words.
 */
function costOn(cost: AliasCost, harness: AgentHarnessId): ShownCost {
  if (harness !== "claude-code" && harness !== "codex") return cost;
  if (cost.kind !== "price" && cost.kind !== "no-price") return cost;
  return { kind: "subscription", plan: words.subscriptionPlans[harness] };
}

/** The end of the line: the price, why there is none to pay, or "No price" with **Add a price**. */
function Cost({
  cost,
  addPrice,
}: {
  readonly cost: ShownCost;
  readonly addPrice: (() => void) | undefined;
}) {
  switch (cost.kind) {
    case "price":
      return words.aliasPrice(cost.input, cost.output);
    case "on-this-computer":
      return words.aliasOnThisComputer;
    case "test-model":
      return words.aliasTestModel;
    case "subscription":
      return words.aliasSubscription(cost.plan);
    case "no-price":
      return (
        <>
          {words.aliasNoPrice}
          {addPrice !== undefined && (
            <>
              {" · "}
              <button type="button" className={inlineLinkClasses} onClick={addPrice}>
                {words.addAPrice}
              </button>
            </>
          )}
        </>
      );
  }
}
