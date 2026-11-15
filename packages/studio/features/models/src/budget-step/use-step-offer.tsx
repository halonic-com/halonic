import type { Provider } from "@halonicjs/format";
import { useToastStore } from "@halonicjs/studio-kit";
import { hasBudget, providerHost } from "@halonicjs/workspace";
import { type ReactNode, useState } from "react";
import type { ModelsState } from "../aliases/read-models.ts";
import type { ModelsFiles, NoLimitMemory } from "../api.ts";
import { providerName, providerPlace } from "../providers/provider-rows.ts";
import { type StepKind, stepToAsk } from "./step-asks.ts";
import { PricesBudgetDialog } from "./step-dialog.tsx";
import { NO_LIMIT_LINE } from "./step-text.ts";

/** What the provider page gets back: the two triggers, and the dialog to render. */
export interface StepOffer {
  /** Offers the step for the provider if its rules say so (flow-models 4.1). */
  readonly offer: (provider: Provider) => void;
  /** The open dialog, or nothing. */
  readonly dialog: ReactNode;
}

/** The aliases of the provider by name, and how many of them have no price. */
function aliasesOf(state: Extract<ModelsState, { status: "ready" }>, provider: Provider) {
  const names = Object.entries(state.models.aliases)
    .filter(([, alias]) => alias.provider === provider.id)
    .sort(([a], [b]) => a.localeCompare(b));
  const unpriced = names.filter(
    ([, { price }]) => price?.input === undefined || price.output === undefined,
  );
  return { names: names.map(([name]) => name), unpriced: unpriced.map(([name]) => name) };
}

/**
 * The Prices and budget step for the provider page (`models.budget-step.ask-for-pay-per-use`).
 * `offer` is called by trigger (a), a provider edit that made it pay-per-use or moved its host, and
 * trigger (b), the first key saved. It reads the state at that moment: no step when the provider
 * can't bill per use or "No limit" is remembered; the whole step without a budget; only the prices
 * of the unpriced aliases with one.
 *
 * @example
 * const { offer, dialog } = useStepOffer(files, state, memory);
 */
export function useStepOffer(
  files: ModelsFiles,
  state: ModelsState,
  memory: NoLimitMemory | undefined,
): StepOffer {
  const toasts = useToastStore();
  const [open, setOpen] = useState<{ provider: Provider; kind: Exclude<StepKind, "none"> }>();
  const offer = (provider: Provider) => {
    if (state.status !== "ready") return;
    const { unpriced } = aliasesOf(state, provider);
    const kind = stepToAsk({
      provider,
      hasBudget: hasBudget(state.budget),
      unpricedAliases: unpriced.length,
      noLimitRemembered: memory?.remembered(provider.id, providerHost(provider) ?? "") ?? false,
    });
    if (kind !== "none") setOpen({ provider, kind });
  };
  if (open === undefined || state.status !== "ready") return { offer, dialog: null };
  const { provider, kind } = open;
  const { names, unpriced } = aliasesOf(state, provider);
  const host = providerHost(provider) ?? "";
  const dialog = (
    <PricesBudgetDialog
      files={files}
      providerName={providerName(provider)}
      kind={kind}
      aliases={kind === "full" ? names : unpriced}
      currency={state.currency}
      budget={{ perRun: state.budget?.perRun, monthly: state.budget?.monthly }}
      providerIsLocal={providerPlace(provider) === "local"}
      {...(memory === undefined
        ? {}
        : {
            onNoLimit: () => {
              memory.remember(provider.id, host);
              toasts?.show({ tone: "success", title: NO_LIMIT_LINE });
            },
          })}
      onClose={() => setOpen(undefined)}
    />
  );
  return { offer, dialog };
}
