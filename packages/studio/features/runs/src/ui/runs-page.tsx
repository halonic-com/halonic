import {
  Button,
  EmptyState,
  FilterChips,
  List,
  type ListRow,
  StatusChip,
} from "@halonicjs/studio-kit";
import { errorMessageFor, type PlaceViewProps } from "@halonicjs/studio-shell";
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
import { emptyListWords, pageWords } from "../run-words.ts";
import { type RunsList, RunsListService, type RunsListState } from "../runs-list.ts";

/** The Runs place's page: the open workspace's runs, from `RunsListService`. */
export function RunsPage({ context }: PlaceViewProps) {
  const { openPlace } = context;
  return (
    <RunsView
      list={context.services.get(RunsListService)}
      {...(openPlace === undefined ? {} : { goToWorkflows: () => openPlace("workflows") })}
    />
  );
}

/** Props for {@link RunsView}. */
export interface RunsViewProps {
  readonly list: RunsList;
  /** Opens Workflows, for the empty state's button; without it the button isn't there. */
  readonly goToWorkflows?: () => void;
  /** The clock for the day headings and due times; tests pass a fixed one. */
  readonly now?: () => Date;
}

/**
 * The Runs list on the desktop (checklist part 1, 1.2 to 1.4): "Runs", its
 * sentence, the status chips and the Test runs chip, then the runs grouped by
 * the day they started, newest first. A row shows what ran with the line
 * under it, its short id and its status chip. Refreshes update the rows in
 * place (D1); the filters work on the runs already loaded, so a filter change
 * never waits (K4).
 *
 * Not here yet: the spend line (T4), opening a run (the run page), the text
 * and hub filters, the row's ⋮, and the Started by, When and Took columns.
 */
export function RunsView({ list, goToWorkflows, now = () => new Date() }: RunsViewProps) {
  const subscribe = useCallback((listener: () => void) => list.subscribe(listener), [list]);
  const state = useSyncExternalStore(subscribe, () => list.state);
  const [filters, setFilters] = useState<RunsFilters>(startFilters);
  const retry = () => void list.refresh();
  const currency = list.source.currency();
  const rows = state.runs.map((run) =>
    runRow(run, {
      workflow: list.source.workflow(run.summary.hubId, run.summary.workflowId),
      currency,
      now: now(),
    }),
  );
  const showTestRuns = () => setFilters({ ...filters, testRuns: true });

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
        now={now()}
      />
    </div>
  );
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
  now,
}: {
  readonly state: RunsListState;
  readonly rows: readonly RunRow[];
  readonly filters: RunsFilters;
  readonly onFilters: (filters: RunsFilters) => void;
  readonly retry: () => void;
  readonly showTestRuns: () => void;
  readonly goToWorkflows: (() => void) | undefined;
  readonly now: Date;
}) {
  if (!state.loaded && state.error !== undefined) {
    return (
      <EmptyState
        tone="error"
        align="start"
        title={emptyListWords.loadFailed}
        description={failureReason(state.error)}
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
  now,
}: {
  readonly loaded: boolean;
  readonly rows: readonly RunRow[];
  /** Never `no-runs`: that state has no filters, so it isn't drawn here. */
  readonly empty: Exclude<EmptyList, { kind: "no-runs" }> | undefined;
  readonly retry: () => void;
  readonly showTestRuns: () => void;
  readonly now: Date;
}) {
  if (!loaded) {
    return (
      <List
        label={pageWords.title}
        rows={[]}
        loading
        loadingLabel={emptyListWords.loading}
        onRetry={retry}
      />
    );
  }
  if (empty === undefined) {
    return <DayLists rows={rows} now={now} />;
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

/** The runs under one heading per day they started. */
function DayLists({ rows, now }: { readonly rows: readonly RunRow[]; readonly now: Date }) {
  return (
    <div className="flex flex-col gap-4">
      {dayGroups(rows, now).map((group) => (
        <List key={group.day} heading={{ name: group.day }} rows={group.rows.map(listRow)} />
      ))}
    </div>
  );
}

/** A run as a List row: what ran over its line, then its Test tag, short id and status chip. */
function listRow(row: RunRow): ListRow {
  return {
    id: row.id,
    title: row.workflow,
    meta: row.line,
    trailing: (
      <span className="flex items-center gap-3">
        {row.test ? <StatusChip tone="outline">{pageWords.testTag}</StatusChip> : null}
        <span className="text-code text-fg-muted">{row.shortId}</span>
        <StatusChip tone={row.chip.tone} dot={row.chip.dot}>
          {row.chip.word}
        </StatusChip>
      </span>
    ),
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

/**
 * Why the runs couldn't load (R17): a kinded error's own reason, else that the engine isn't
 * answering, since a load that fails without a kind never reached it.
 */
function failureReason(error: unknown): string {
  const message = errorMessageFor(error, { title: emptyListWords.loadFailed });
  const reason = message.body.trim();
  return message.kind === "internal" || reason === "" ? emptyListWords.notAnswering : reason;
}
