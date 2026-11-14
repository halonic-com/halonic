import type { RunSummary } from "@halonicjs/events";
import { Button, List, type ListRow, StatusChip, usePresentation } from "@halonicjs/studio-kit";
import type { HomeCardProps } from "@halonicjs/studio-shell";
import { use, useCallback, useSyncExternalStore } from "react";
import { listRows } from "../list/list-rows.ts";
import { recentRuns } from "../list/recent-runs.ts";
import type { RunRow } from "../list/run-row.ts";
import { homeWords } from "../run-words.ts";
import { type RunsList, RunsListService } from "../runs-list.ts";
import { firstLoad } from "./first-load.ts";

/** Home's Recent runs card: the open workspace's runs, from `RunsListService`. */
export function RecentRunsCard({ context }: HomeCardProps) {
  const { openPlace, openItem } = context;
  return (
    <RecentRunsView
      list={context.services.get(RunsListService)}
      {...(openPlace === undefined ? {} : { openRuns: () => openPlace("runs") })}
      {...(openItem === undefined
        ? {}
        : {
            openRun: (run: RunSummary) => openItem({ kind: "run", hub: run.hubId, id: run.id }),
          })}
    />
  );
}

/** Props for {@link RecentRunsView}. */
export interface RecentRunsViewProps {
  readonly list: RunsList;
  /** Opens the Runs place, for **See all runs** on a phone; without it the row isn't there. */
  readonly openRuns?: () => void;
  /** Opens a run's page in the active tab; without it a row can't open. */
  readonly openRun?: (run: RunSummary) => void;
  /** The clock for due times; tests pass a fixed one. */
  readonly now?: () => Date;
}

/**
 * Home's Recent runs (checklist part 1, 1.1; UX2 1.9 and 1.15): the latest five runs, running
 * and needs-you ones first, each with its chip and the line the Runs list shows under What ran;
 * a failed run's line is its Failed sentence. The heading's "*N* running" chip is the Runs
 * place's signal, which the shell draws. On a phone, **See all runs** follows the rows. With no
 * runs: "No runs yet. When an agent or workflow runs, you'll see it here." and, so Home doesn't end on
 * nothing, how to start one from the command line.
 *
 * The section shows its skeleton until the first list loads, and its error with **Try again** if
 * that load fails; a later failed load keeps the rows as they were.
 */
export function RecentRunsView({
  list,
  openRuns,
  openRun,
  now = () => new Date(),
}: RecentRunsViewProps) {
  const subscribe = useCallback((listener: () => void) => list.subscribe(listener), [list]);
  const state = useSyncExternalStore(subscribe, () => list.state);
  const phone = usePresentation() === "phone";
  // Called on every render, as React asks: the promise stays settled once the first list is in.
  use(firstLoad(list));
  const shown = recentRuns(listRows(list, now()));
  const open =
    openRun === undefined
      ? undefined
      : (id: string) => {
          const run = state.runs.find((candidate) => candidate.summary.id === id);
          if (run !== undefined) openRun(run.summary);
        };

  return (
    <>
      <List
        label={homeWords.label}
        rows={shown.map(homeRow)}
        {...(open === undefined ? {} : { onOpen: open })}
        empty={{ title: homeWords.empty, plain: true }}
      />
      {shown.length === 0 ? (
        <p className="m-0 text-fg-muted">
          {homeWords.startNote[0]}
          <code className="font-mono">{homeWords.startNote[1]}</code>
          {homeWords.startNote[2]}
        </p>
      ) : null}
      {phone && openRuns !== undefined && shown.length > 0 ? (
        <Button variant="ghost" size="touch" onClick={openRuns}>
          {homeWords.seeAll}
        </Button>
      ) : null}
    </>
  );
}

/**
 * A run as one row: what ran over its line, and its status chip at the right edge. A failed
 * run's line is the kit's error reason, in `danger`, with the Failed chip, as in the Runs list.
 */
function homeRow(row: RunRow): ListRow {
  return {
    id: row.id,
    title: row.workflow,
    meta: row.line,
    trailing: (
      <StatusChip tone={row.chip.tone} dot={row.chip.dot}>
        {row.chip.word}
      </StatusChip>
    ),
    ...(row.standing === "failed" ? { error: { reason: row.line, chip: row.chip.word } } : {}),
  };
}
