import { inlineLinkClasses } from "@halonicjs/studio-kit";
import type { AliasCost, AliasSummary } from "../api.ts";
import { configurationWords as words } from "./configuration-words.ts";

/** Opens an alias's tab on Models, with its price field focused when `focusPrice` is set. */
export type OpenAlias = (name: string, options?: { readonly focusPrice?: boolean }) => void;

/** Props for {@link AliasLine}. */
export interface AliasLineProps {
  readonly alias: string;
  readonly summary: AliasSummary;
  /** Opens the alias on Models; absent where the window can't, which leaves the name as text. */
  readonly openAlias?: OpenAlias | undefined;
}

/**
 * The line under the Model page's picker (UX 2.5, microcopy 8.5): "**smart** · Anthropic /
 * claude-sonnet-5-5 · €3.00 in, €15.00 out per million tokens". The alias name opens its tab on
 * Models; without a price the line ends with **Add a price**, which opens it at the price.
 */
export function AliasLine({ alias, summary, openAlias }: AliasLineProps) {
  return (
    <p className="text-caption text-fg-muted">
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
        cost={summary.cost}
        addPrice={openAlias && (() => openAlias(alias, { focusPrice: true }))}
      />
    </p>
  );
}

/** The end of the line: the price, why there is none to pay, or "No price" with **Add a price**. */
function Cost({
  cost,
  addPrice,
}: {
  readonly cost: AliasCost;
  readonly addPrice: (() => void) | undefined;
}) {
  switch (cost.kind) {
    case "price":
      return words.aliasPrice(cost.input, cost.output);
    case "on-this-computer":
      return words.aliasOnThisComputer;
    case "test-model":
      return words.aliasTestModel;
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
