import {
  Button,
  List,
  type ListHeadingTone,
  type ListRow,
  useFormatLocale,
} from "@halonicjs/studio-kit";
import { type GroupedRun, type RunGroup, runGroups, todaySummary } from "../list/run-groups.ts";
import { type AppRun, appListWords, rowCostParts, rowTimeWords, summaryWords } from "./app-run.ts";
import { RunTile } from "./run-tile.tsx";

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
 * Each row leads with what ran as a tile with its state's corner dot, then
 * three lines (HAL-18594 rev 3): what ran and the time, the run's line, and
 * where it runs with its cost under the time. ↑ ↓ pass over the rows; a
 * click or Enter opens one.
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
  const locale = useFormatLocale();
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
          heading: { name: group.heading, ...headingTone(group.kind) },
          rows: group.runs.map((run) => appRow(run, now, timeZone, locale)),
        }))}
        groupHeadingLevel={2}
        onOpen={onOpen}
        {...(selected === undefined ? {} : { current: selected })}
      />
    </section>
  );
}

/** Needs you in the needs-you violet and Failed in `danger`; the other headings as the List draws them. */
function headingTone(kind: RunGroup<AppRun>["kind"]): { tone?: ListHeadingTone } {
  if (kind === "needs-you") return { tone: "warning" };
  if (kind === "failed") return { tone: "danger" };
  return {};
}

/**
 * A run as a List row: its tile, what ran with the time, its line, and where it runs with its
 * cost. The state is the tile's corner dot for the eye and the label's word for a screen reader.
 */
function appRow(run: AppRun, now: Date, timeZone: string, locale: string | undefined): ListRow {
  return {
    id: run.id,
    title: run.title,
    titleEnd: rowTimeWords(run, now, timeZone, locale),
    meta: run.line,
    under: <WhereLine run={run} />,
    avatar: <RunTile by={run.by} phase={run.phase} />,
    // Not the kit's error look: it gives the row's end to the reason, and every row keeps its cost.
    label: run.label,
  };
}

/** The row's third line: where it runs, and its cost right-aligned under the time. */
function WhereLine({ run }: { readonly run: AppRun }) {
  const cost = rowCostParts(run.cost, isGoing(run));
  return (
    <span
      data-part="where-line"
      className="flex min-w-0 items-baseline justify-between gap-3 text-small text-fg-muted"
    >
      <span className="truncate">{run.where}</span>
      {cost === undefined ? null : (
        <span data-part="cost" className="shrink-0 tabular-nums">
          {cost.amount === undefined ? null : <span className="text-fg">{cost.amount}</span>}
          {cost.rest}
        </span>
      )}
    </span>
  );
}

/** Whether the run is still going, so its cost is "so far". */
function isGoing(run: GroupedRun): boolean {
  return run.phase === "running" || run.phase === "needs-you";
}
