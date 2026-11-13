import { MonthBars, usePresentation } from "@halonicjs/studio-kit";
import type { HomeCardProps } from "@halonicjs/studio-shell";
import { use, useCallback, useSyncExternalStore } from "react";
import { RunsSourceService } from "../api.ts";
import { spendTile } from "../list/spend-tile.ts";
import { spendWords } from "../run-words.ts";
import { type RunsList, RunsListService } from "../runs-list.ts";
import { firstLoad } from "./first-load.ts";

/** Home's Spend section: the open workspace's runs, from `RunsListService`, and its budget. */
export function SpendCard({ context }: HomeCardProps) {
  const source = context.services.get(RunsSourceService);
  return (
    <SpendView
      list={context.services.get(RunsListService)}
      currency={() => source.currency()}
      monthlyBudget={() => source.monthlyBudget()}
    />
  );
}

/** Props for {@link SpendView}. */
export interface SpendViewProps {
  readonly list: RunsList;
  /** The workspace's currency and monthly budget, read each time the runs change. */
  readonly currency: () => string;
  readonly monthlyBudget: () => number | undefined;
  /** The clock that sets the current month; tests pass a fixed one. */
  readonly now?: () => Date;
}

/**
 * Home's Spend (HAL-8553): one tile, the last six months of spend as bars with the monthly
 * budget as a line, in the left column on a desktop and full width on a phone. It isn't a link.
 * With no run that cost anything it says "No spend yet. When a run costs something, you'll see
 * it here by month." and stays on Home. The section shows its skeleton until the first list
 * loads, and its error with **Try again** if that load fails.
 */
export function SpendView({
  list,
  currency,
  monthlyBudget,
  now = () => new Date(),
}: SpendViewProps) {
  const subscribe = useCallback((listener: () => void) => list.subscribe(listener), [list]);
  const state = useSyncExternalStore(subscribe, () => list.state);
  const phone = usePresentation() === "phone";
  use(firstLoad(list));
  const tile = spendTile(
    state.runs.map((run) => run.summary),
    now().toISOString(),
    currency(),
    monthlyBudget(),
  );
  return (
    <div className={phone ? "grid gap-2 px-4" : "grid grid-cols-2 gap-2"}>
      <MonthBars
        title={spendWords.title}
        months={tile?.months ?? []}
        emptyText={spendWords.empty}
        {...(tile?.format === undefined ? {} : { format: tile.format })}
        {...(tile?.note === undefined ? {} : { note: tile.note })}
        {...(tile?.limit === undefined ? {} : { limit: tile.limit })}
      />
    </div>
  );
}
