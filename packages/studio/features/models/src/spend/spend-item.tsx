import { defaultCurrency, spendByMonth, treeCost, treeUnpriced } from "@halonicjs/app";
import { type RunsList, RunsListService } from "@halonicjs/studio-feature-runs/api";
import { Button, Tooltip } from "@halonicjs/studio-kit";
import type { ItemRef, StatusBarItemProps, WorkspaceContext } from "@halonicjs/studio-shell";
import { isPayPerUse } from "@halonicjs/workspace";
import { useCallback, useSyncExternalStore } from "react";
import { useModels } from "../aliases/use-models.ts";
import { ModelsFilesService } from "../api.ts";
import { monthLine, type RunSpend, SPEND_TOOLTIP } from "./spend-text.ts";

/** The command that opens the workspace page, where the Models section and its Budget block are. */
const openModelsCommand = "workspace.open-models";

/**
 * The status bar's month spend (`models.spend.month-line`): the estimated cost of this month, of
 * the monthly budget when there is one. It shows only while a provider may bill per use (never
 * under `privacy.localOnly`) and once the shared run list has been read. A press opens the workspace page.
 */
export function SpendItem({ context }: StatusBarItemProps) {
  const files = context.services.get(ModelsFilesService);
  const list = context.services.find(RunsListService);
  const [state] = useModels(files);
  const { spent, run } = useRunsSpend(list, useActiveRun(context));
  if (spent === undefined || state.status === "loading") return null;
  if (state.localOnly || !state.providers.some(isPayPerUse)) return null;
  const currency = state.budget?.currency ?? defaultCurrency;
  const line = monthLine(
    spent,
    state.budget?.monthly,
    currency,
    run && { spend: run, perRun: state.budget?.perRun },
  );
  return (
    <Tooltip text={SPEND_TOOLTIP}>
      {(trigger) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => context.runCommand?.(openModelsCommand)}
          {...trigger}
        >
          <span className={line.usedUp ? "text-attention" : undefined}>{line.text}</span>
        </Button>
      )}
    </Tooltip>
  );
}

/** The run the focused tab shows; `undefined` when it shows no run, or the window has no tabs. */
function useActiveRun(context: WorkspaceContext): ItemRef | undefined {
  const source = context.activeItem;
  const subscribe = useCallback(
    (listener: () => void) => source?.subscribe(listener) ?? (() => undefined),
    [source],
  );
  const item = useSyncExternalStore(subscribe, () => source?.get() ?? null);
  return item?.kind === "run" ? item : undefined;
}

/**
 * This month's cost, and the cost of the run in view, from the Runs feature's shared list,
 * recomputed whenever it changes. `spent` is `undefined` until the list has been read, and `run`
 * while the run isn't in it.
 */
function useRunsSpend(
  list: RunsList | undefined,
  inView: ItemRef | undefined,
): { spent: number | undefined; run: RunSpend | undefined } {
  const subscribe = useCallback(
    (listener: () => void) => list?.subscribe(listener) ?? (() => undefined),
    [list],
  );
  const state = useSyncExternalStore(subscribe, () => list?.state);
  if (state === undefined || !state.loaded) return { spent: undefined, run: undefined };
  const at = new Date().toISOString();
  const summaries = state.runs.map(({ summary }) => summary);
  const found =
    inView &&
    state.runs.find(({ summary }) => summary.id === inView.id && summary.hubId === inView.hub);
  return {
    spent: spendByMonth(summaries, at, 1)[0]?.spent,
    run: found && {
      cost: treeCost(summaries, found.summary.id),
      unpricedCalls: treeUnpriced(summaries, found.summary.id),
    },
  };
}
