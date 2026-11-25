import { Button, List, type ListRow, StatusChip } from "@halonicjs/studio-kit";
import { type GroupedRun, runGroups, todaySummary } from "../list/run-groups.ts";
import { lineSeparator } from "../run-words.ts";
import { type AppRun, appListWords, rowCostWords, summaryWords } from "./app-run.ts";

/** Props for {@link RunsAppList}. */
export interface RunsAppListProps {
  /** Every run of every connected workspace and team. */
  readonly runs: readonly AppRun[];
  /** The runs the user has opened, whose failures have left Failed. */
  readonly opened: ReadonlySet<string>;
  readonly now: Date;
  /** The user's IANA time zone. */
  readonly timeZone: string;
  /** The run open in the pane, whose row is marked as the current one. */
  readonly selected: string | undefined;
  /** Opens a run, for a row's click and Enter. */
  readonly onOpen: (id: string) => void;
  /** Opens the Costs view, from the summary line. */
  readonly onCosts: () => void;
}

/**
 * The Runs app's list column (`runs.app-list`): "Runs" with how many are
 * running, the summary line with **Costs ›**, then the runs grouped Needs
 * you, Failed, Running, then by day, in the Messenger and Inbox list look.
 * Each row says what ran, its line and where it runs, with its cost at the
 * end. ↑ ↓ pass over the rows; a click or Enter opens one.
 */
export function RunsAppList({
  runs,
  opened,
  now,
  timeZone,
  selected,
  onOpen,
  onCosts,
}: RunsAppListProps) {
  const summary = todaySummary(runs, { now, timeZone });
  const groups = runGroups(runs, { opened, now, timeZone });
  return (
    <section aria-labelledby="runs-app-title" className="flex min-w-0 flex-col gap-3">
      <header className="flex flex-col gap-1 px-4 pt-4">
        <h1 id="runs-app-title" className="flex items-baseline gap-2 text-title">
          {appListWords.title}
          {summary.running === 0 ? null : (
            <span className="text-body text-fg-muted">{appListWords.running(summary.running)}</span>
          )}
        </h1>
        <p className="flex flex-wrap items-center gap-2 text-body text-fg-muted">
          {summaryWords(summary)}
          <Button variant="ghost" size="sm" onClick={onCosts}>
            {`${appListWords.costs} ›`}
          </Button>
        </p>
      </header>
      <List
        label={appListWords.title}
        groups={groups.map((group) => ({
          id: group.kind === "day" ? `day-${group.heading}` : group.kind,
          heading: { name: group.heading },
          rows: group.runs.map(appRow),
        }))}
        groupHeadingLevel={2}
        onOpen={onOpen}
        {...(selected === undefined ? {} : { current: selected })}
      />
    </section>
  );
}

/**
 * A run as a List row: its chip, what ran, its line and where, and its cost at the end. A failed
 * run shows it by its chip, in the danger tone.
 */
function appRow(run: AppRun): ListRow {
  const cost = rowCostWords(run.cost, isGoing(run));
  return {
    id: run.id,
    title: run.title,
    meta: `${run.line}${lineSeparator}${run.where}`,
    icon: <StatusChip tone={run.chip.tone}>{run.chip.word}</StatusChip>,
    ...(cost === undefined ? {} : { trailing: <span className="text-fg-muted">{cost}</span> }),
    // Not the kit's error look: it gives the row's end to the reason, and every row keeps its cost.
    label: run.label,
  };
}

/** Whether the run is still going, so its cost is "so far". */
function isGoing(run: GroupedRun): boolean {
  return run.phase === "running" || run.phase === "needs-you";
}
