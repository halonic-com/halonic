import type { RunSummary } from "@halonicjs/events";
import {
  Button,
  EmptyState,
  FilterChips,
  List,
  type ListColumn,
  type ListColumnsRow,
  StatusChip,
  Tooltip,
} from "@halonicjs/studio-kit";
import type { PlaceViewProps } from "@halonicjs/studio-shell";
import { useCallback, useState, useSyncExternalStore } from "react";
import { type RunRow, runRow } from "../list/run-row.ts";
import {
  dayGroups,
  type EmptyList,
  emptyList,
  filterRuns,
  type RunsFilters,
  type StatusFilter,
  startFilters,
  statusCounts,
} from "../list/runs-filter.ts";
import { loadFailureReason } from "../load-failure.ts";
import { emptyListWords, pageWords } from "../run-words.ts";
import { type RunsList, RunsListService, type RunsListState } from "../runs-list.ts";

/** The Runs place's page: the open workspace's runs, from `RunsListService`. */
export function RunsPage({ context }: PlaceViewProps) {
  const { openPlace, openItem } = context;
  return (
    <RunsView
      list={context.services.get(RunsListService)}
      {...(openPlace === undefined ? {} : { goToWorkflows: () => openPlace("workflows") })}
      {...(openItem === undefined
        ? {}
        : {
            openRun: (run: RunSummary) => openItem({ kind: "run", hub: run.hubId, id: run.id }),
          })}
    />
  );
}

/** Props for {@link RunsView}. */
export interface RunsViewProps {
  readonly list: RunsList;
  /** Opens Workflows, for the empty state's button; without it the button isn't there. */
  readonly goToWorkflows?: () => void;
  /** Opens a run's page in the active tab, for a row's click and Enter. */
  readonly openRun?: (run: RunSummary) => void;
  /** The clock for the day headings and due times; tests pass a fixed one. */
  readonly now?: () => Date;
}

/**
 * The Runs list on the desktop (checklist part 1, 1.2 to 1.4): "Runs", its
 * sentence, the status chips and the Test runs chip, then the runs grouped by
 * the day they started, newest first. A row's columns are its status chip,
 * its short id, what ran with the line under it, what started it, and when
 * it started over how long it took. Refreshes update the rows in place (D1); the filters work
 * on the runs already loaded, so a filter change never waits (K4).
 *
 * Not here yet: the spend line (T4), opening a run in a new tab, the text
 * and hub filters, and the row's ⋮.
 */
export function RunsView({ list, goToWorkflows, openRun, now = () => new Date() }: RunsViewProps) {
  const subscribe = useCallback((listener: () => void) => list.subscribe(listener), [list]);
  const state = useSyncExternalStore(subscribe, () => list.state);
  const [filters, setFilters] = useState<RunsFilters>(startFilters);
  const retry = () => void list.refresh();
  const currency = list.source.currency();
  const rows = state.runs.map((run) =>
    runRow(run, {
      workflow: list.source.workflow(run.summary.hubId, run.summary.workflowId),
      routine: routineOf(list, run.summary),
      currency,
      now: now(),
    }),
  );
  const showTestRuns = () => setFilters({ ...filters, testRuns: true });
  const openRow =
    openRun === undefined
      ? undefined
      : (id: string) => {
          const run = state.runs.find((candidate) => candidate.summary.id === id);
          if (run !== undefined) openRun(run.summary);
        };

  return (
    <div className="flex w-full flex-col gap-4 px-6 py-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-title">{pageWords.title}</h1>
        <p className="text-body text-fg-muted">{pageWords.sentence}</p>
      </header>
      {state.loaded && state.error !== undefined ? (
        <p className="text-small text-fg-muted">{emptyListWords.showingLast}</p>
      ) : null}
      <PageBody
        state={state}
        rows={rows}
        filters={filters}
        onFilters={setFilters}
        retry={retry}
        showTestRuns={showTestRuns}
        goToWorkflows={goToWorkflows}
        openRow={openRow}
        now={now()}
      />
    </div>
  );
}

/** The routine that started the run, when its trigger names one. */
function routineOf(list: RunsList, summary: RunSummary) {
  const key = summary.trigger?.routineId;
  return key === undefined ? undefined : list.source.routine(key);
}

/** What comes under the sentence: the load error, the no-runs state, or the filters and the runs. */
function PageBody({
  state,
  rows,
  filters,
  onFilters,
  retry,
  showTestRuns,
  goToWorkflows,
  openRow,
  now,
}: {
  readonly state: RunsListState;
  readonly rows: readonly RunRow[];
  readonly filters: RunsFilters;
  readonly onFilters: (filters: RunsFilters) => void;
  readonly retry: () => void;
  readonly showTestRuns: () => void;
  readonly goToWorkflows: (() => void) | undefined;
  readonly openRow: ((id: string) => void) | undefined;
  readonly now: Date;
}) {
  if (!state.loaded && state.error !== undefined) {
    return (
      <EmptyState
        tone="error"
        align="start"
        title={emptyListWords.loadFailed}
        description={loadFailureReason(state.error)}
        action={{ label: "Try again", onClick: retry }}
      />
    );
  }
  const empty = state.loaded ? emptyList(rows, filters) : undefined;
  if (empty?.kind === "no-runs") {
    return <NoRuns goToWorkflows={goToWorkflows} />;
  }
  return (
    <>
      <Filters rows={rows} filters={filters} onChange={onFilters} />
      <Runs
        loaded={state.loaded}
        rows={filterRuns(rows, filters)}
        empty={empty}
        retry={retry}
        showTestRuns={showTestRuns}
        openRow={openRow}
        now={now}
      />
    </>
  );
}

/** No runs at all (R1), with no filters above it: there's nothing to filter. */
function NoRuns({ goToWorkflows }: { readonly goToWorkflows: (() => void) | undefined }) {
  return (
    <EmptyState
      title={emptyListWords.noRunsTitle}
      description={emptyListWords.noRunsBody}
      {...(goToWorkflows === undefined
        ? {}
        : { action: { label: emptyListWords.goToWorkflows, onClick: goToWorkflows } })}
    />
  );
}

/** The skeleton rows until the first list loads (R10), then the runs or the line in their place. */
function Runs({
  loaded,
  rows,
  empty,
  retry,
  showTestRuns,
  openRow,
  now,
}: {
  readonly loaded: boolean;
  readonly rows: readonly RunRow[];
  /** Never `no-runs`: that state has no filters, so it isn't drawn here. */
  readonly empty: Exclude<EmptyList, { kind: "no-runs" }> | undefined;
  readonly retry: () => void;
  readonly showTestRuns: () => void;
  readonly openRow: ((id: string) => void) | undefined;
  readonly now: Date;
}) {
  if (!loaded) {
    return (
      <List
        label={pageWords.title}
        rows={[]}
        columns={runColumns}
        loading
        loadingLabel={emptyListWords.loading}
        onRetry={retry}
      />
    );
  }
  if (empty === undefined) {
    return <DayList rows={rows} openRow={openRow} now={now} />;
  }
  if (empty.kind === "only-test-runs") {
    return (
      <EmptyLine
        line={empty.line}
        action={{ label: emptyListWords.showTestRuns, onClick: showTestRuns }}
      />
    );
  }
  return <EmptyLine line={empty.line} />;
}

/** The status chips, one choice, with counts on Live and Needs you; then the Test runs chip. */
function Filters({
  rows,
  filters,
  onChange,
}: {
  readonly rows: readonly RunRow[];
  readonly filters: RunsFilters;
  readonly onChange: (filters: RunsFilters) => void;
}) {
  const counts = statusCounts(rows, filters.testRuns);
  const chip = (value: StatusFilter, count?: number) => ({
    value,
    label:
      count === undefined
        ? pageWords.statusChips[value]
        : `${pageWords.statusChips[value]} ${count}`,
  });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterChips
        label={pageWords.status}
        options={[
          chip("all"),
          chip("live", counts.live),
          chip("needs-you", counts.needsYou),
          chip("failed"),
        ]}
        value={filters.status}
        onChange={(status) => onChange({ ...filters, status })}
      />
      <FilterChips
        label={pageWords.filters}
        toggles={[
          {
            label: pageWords.testRuns,
            pressed: filters.testRuns,
            onChange: (testRuns) => onChange({ ...filters, testRuns }),
          },
        ]}
      />
    </div>
  );
}

/** A row's columns, in `halonic runs`' order (checklist 1.2; T8-F1). */
const runColumns: readonly ListColumn[] = [
  { kind: "status", key: "status" },
  { kind: "code", key: "run" },
  { kind: "main" },
  { kind: "text", key: "startedBy" },
  { kind: "time", key: "when" },
];

/**
 * The runs in one list, under an `h3` for each day they started, which ↑ ↓
 * pass over; a click or Enter on a row opens its run.
 */
function DayList({
  rows,
  openRow,
  now,
}: {
  readonly rows: readonly RunRow[];
  readonly openRow: ((id: string) => void) | undefined;
  readonly now: Date;
}) {
  return (
    <List
      label={pageWords.title}
      groups={dayGroups(rows, now).map((group) => ({
        id: group.day,
        heading: { name: group.day },
        rows: group.rows.map(listRow),
      }))}
      columns={runColumns}
      {...(openRow === undefined ? {} : { onOpen: openRow })}
    />
  );
}

/**
 * A run as a List row: its chip, short id, what ran over its line with its
 * Test tag, what started it, with the routine's name in a tooltip, and when
 * it started. A failed row's line is the kit's error reason, in `danger`,
 * with the Failed chip.
 */
function listRow(row: RunRow): ListColumnsRow {
  return {
    id: row.id,
    title: row.workflow,
    meta: row.line,
    ...(row.test ? { tag: <StatusChip tone="outline">{pageWords.testTag}</StatusChip> } : {}),
    cells: {
      status: {
        value: (
          <StatusChip tone={row.chip.tone} dot={row.chip.dot}>
            {row.chip.word}
          </StatusChip>
        ),
      },
      run: { value: row.shortId },
      startedBy: {
        value:
          row.startedByTooltip === undefined ? (
            row.startedBy
          ) : (
            <Tooltip text={row.startedByTooltip}>
              {(props) => <span {...props}>{row.startedBy}</span>}
            </Tooltip>
          ),
      },
      when: { value: row.time, ...(row.took === undefined ? {} : { detail: row.took }) },
    },
    label: row.label,
    ...(row.standing === "failed" ? { error: { reason: row.line, chip: row.chip.word } } : {}),
  };
}

/** One quiet line where the rows would be, with its one button if it has one (R2, R4 to R6). */
function EmptyLine({
  line,
  action,
}: {
  readonly line: string;
  readonly action?: { readonly label: string; readonly onClick: () => void };
}) {
  return (
    <p className="flex flex-wrap items-center gap-2 px-4 py-1 text-body text-fg-muted">
      {line}
      {action === undefined ? null : (
        <Button variant="ghost" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </p>
  );
}
