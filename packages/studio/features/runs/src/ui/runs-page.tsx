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
  usePresentation,
} from "@halonicjs/studio-kit";
import { type EngineWords, engineWordsOf, type PlaceViewProps } from "@halonicjs/studio-shell";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { SampleHintService } from "../api.ts";
import { listRows } from "../list/list-rows.ts";
import type { RunRow } from "../list/run-row.ts";
import {
  dayGroups,
  type EmptyList,
  emptyList,
  filterChangeText,
  filterRuns,
  type RunsFilters,
  type StatusFilter,
  startFilters,
  statusCounts,
  type WorkflowRef,
} from "../list/runs-filter.ts";
import { useAnnounceFilterChange } from "../list/use-filter-announcement.ts";
import { FailureReason, RefreshFailedLine } from "../load-failure.tsx";
import { emptyListWords, pageWords, runCommand } from "../run-words.ts";
import { type RunsList, RunsListService, type RunsListState } from "../runs-list.ts";

/** The Runs place's page: the open workspace's runs, from `RunsListService`. */
export function RunsPage({ context }: PlaceViewProps) {
  const { openItem } = context;
  return (
    <RunsView
      list={context.services.get(RunsListService)}
      engine={engineWordsOf(context)}
      isSample={context.services.find(SampleHintService)?.isSample() === true}
      announceState={(key, text) => context.announcer.announceState(key, text)}
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
  /** Opens a run's page in the active tab, for a row's click and Enter. */
  readonly openRun?: (run: RunSummary) => void;
  /** The clock for the day headings and due times; tests pass a fixed one. */
  readonly now?: () => Date;
  /** What the page calls the engine when it isn't answering, for this window's host; the desktop app's by default. */
  readonly engine?: EngineWords;
  /** Whether the workspace is the Acme sample, where a run starts from the Inbox. */
  readonly isSample?: boolean;
  /** Reads how many runs a filter change left (`announcer.announceState`); absent in tests that don't listen. */
  readonly announceState?: (key: string, text: string) => void;
}

/**
 * The Runs list on the desktop (checklist part 1, 1.2 to 1.4): "Runs", its
 * sentence, the status chips and the Test runs chip, then the runs grouped by
 * the day they started, newest first. A row's columns are its status chip,
 * its short id, what ran with the line under it, what started it, and when
 * it started over how long it took. Refreshes update the rows in place (D1); the filters work
 * on the runs already loaded, so a filter change never waits (K4).
 *
 * On a phone (1.14) it is the same page: the heading is for screen readers, the filters take two
 * rows, and the kit's list draws each run as three lines with no ⋮.
 *
 * Not here yet: the spend line (T4), opening a run in a new tab, the text
 * and hub filters (and so the phone's Search and hub picker), and the row's ⋮.
 */
export function RunsView({
  list,
  openRun,
  now = () => new Date(),
  engine = engineWordsOf({}),
  isSample = false,
  announceState,
}: RunsViewProps) {
  const phone = usePresentation() === "phone";
  const subscribe = useCallback((listener: () => void) => list.subscribe(listener), [list]);
  const state = useSyncExternalStore(subscribe, () => list.state);
  const [filters, setFilters] = useState<RunsFilters>(() => ({
    ...startFilters,
    workflow: list.requestedWorkflow,
  }));
  // A request is taken once, by the page open when it comes or the next to open, so a later plain
  // open shows every workflow.
  useEffect(() => {
    const take = () => {
      const workflow = list.requestedWorkflow;
      if (workflow === undefined) return;
      list.clearRequest();
      setFilters((current) => ({ ...current, workflow }));
    };
    take();
    return list.subscribe(take);
  }, [list]);
  const retry = () => void list.refresh();
  const rows = listRows(list, now());
  useAnnounceFilterChange(
    filters,
    state.loaded ? filterChangeText(rows, filters) : undefined,
    announceState,
  );
  const showTestRuns = () => setFilters({ ...filters, testRuns: true });
  const showEveryWorkflow = () => setFilters({ ...filters, workflow: undefined });
  const openRow =
    openRun === undefined
      ? undefined
      : (id: string) => {
          const run = state.runs.find((candidate) => candidate.summary.id === id);
          if (run !== undefined) openRun(run.summary);
        };

  return (
    <div className="flex w-full flex-col gap-4 px-6 py-5">
      {/* On a phone the top bar says "Runs", so the heading is for screen readers only. */}
      <header className="flex flex-col gap-1">
        <h1 className={phone ? "sr-only" : "text-title"}>{pageWords.title}</h1>
        <p className="text-body text-fg-muted">{pageWords.sentence}</p>
      </header>
      {state.loaded && state.error !== undefined ? (
        <RefreshFailedLine
          what={emptyListWords.refreshFailed}
          error={state.error}
          engine={engine}
        />
      ) : null}
      <PageBody
        state={state}
        engine={engine}
        rows={rows}
        filters={filters}
        onFilters={setFilters}
        retry={retry}
        showTestRuns={showTestRuns}
        showEveryWorkflow={showEveryWorkflow}
        openRow={openRow}
        now={now()}
        phone={phone}
        isSample={isSample}
      />
    </div>
  );
}

/** What comes under the sentence: the load error, the no-runs state, or the filters and the runs. */
function PageBody({
  state,
  engine,
  rows,
  filters,
  onFilters,
  retry,
  showTestRuns,
  showEveryWorkflow,
  openRow,
  now,
  phone,
  isSample,
}: {
  readonly state: RunsListState;
  readonly engine: EngineWords;
  readonly rows: readonly RunRow[];
  readonly filters: RunsFilters;
  readonly onFilters: (filters: RunsFilters) => void;
  readonly retry: () => void;
  readonly showTestRuns: () => void;
  readonly showEveryWorkflow: () => void;
  readonly openRow: ((id: string) => void) | undefined;
  readonly now: Date;
  readonly phone: boolean;
  readonly isSample: boolean;
}) {
  if (!state.loaded && state.error !== undefined) {
    return (
      <EmptyState
        tone="error"
        align="start"
        title={emptyListWords.loadFailed}
        description={
          <FailureReason what={emptyListWords.loadFailed} error={state.error} engine={engine} />
        }
        action={{ label: "Try again", onClick: retry }}
      />
    );
  }
  const empty = state.loaded ? emptyList(rows, filters) : undefined;
  if (empty?.kind === "no-runs") {
    return <NoRuns workflows={state.workflows} isSample={isSample} />;
  }
  return (
    <>
      <Filters rows={rows} filters={filters} onChange={onFilters} phone={phone} />
      <Runs
        loaded={state.loaded}
        rows={filterRuns(rows, filters)}
        empty={empty}
        retry={retry}
        showTestRuns={showTestRuns}
        showEveryWorkflow={showEveryWorkflow}
        openRow={openRow}
        now={now}
      />
    </>
  );
}

/**
 * No runs at all (R1), with no filters above it: there's nothing to filter. The line names a
 * workflow to run, or says there is none (HAL-10128); in the Acme sample it says to start one from
 * the Inbox, as Home does (HAL-12225).
 */
function NoRuns({
  workflows,
  isSample,
}: {
  readonly workflows: readonly string[] | undefined;
  readonly isSample: boolean;
}) {
  return (
    <EmptyState
      title={emptyListWords.noRunsTitle}
      description={<NoRunsLine workflows={workflows} isSample={isSample} />}
    />
  );
}

/** The line under "No runs yet": the Inbox in the sample, else where to add a workflow or which one to run. */
function NoRunsLine({
  workflows,
  isSample,
}: {
  readonly workflows: readonly string[] | undefined;
  readonly isSample: boolean;
}) {
  if (isSample) return emptyListWords.noRunsSample;
  if (workflows?.length === 0) return emptyListWords.noRunsNoWorkflow;
  return (
    <>
      {emptyListWords.noRunsBody}
      <code className="font-mono text-code">{runCommand(workflows)}</code>
      {emptyListWords.noRunsBodyEnd}
    </>
  );
}

/** The skeleton rows until the first list loads (R10), then the runs or the line in their place. */
function Runs({
  loaded,
  rows,
  empty,
  retry,
  showTestRuns,
  showEveryWorkflow,
  openRow,
  now,
}: {
  readonly loaded: boolean;
  readonly rows: readonly RunRow[];
  /** Never `no-runs`: that state has no filters, so it isn't drawn here. */
  readonly empty: Exclude<EmptyList, { kind: "no-runs" }> | undefined;
  readonly retry: () => void;
  readonly showTestRuns: () => void;
  readonly showEveryWorkflow: () => void;
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
  if (empty.kind === "workflow") {
    return (
      <EmptyLine
        line={empty.line}
        action={{ label: emptyListWords.showEveryWorkflow, onClick: showEveryWorkflow }}
      />
    );
  }
  return <EmptyLine line={empty.line} />;
}

/**
 * The status chips, one choice, with counts on Live and Needs you; then the Test runs chip, and
 * the Workflow chip while the list is of one workflow, which clears it. On a phone the two groups
 * are two rows.
 */
function Filters({
  rows,
  filters,
  onChange,
  phone,
}: {
  readonly rows: readonly RunRow[];
  readonly filters: RunsFilters;
  readonly onChange: (filters: RunsFilters) => void;
  readonly phone: boolean;
}) {
  const counts = statusCounts(rows, filters);
  const chip = (value: StatusFilter, count?: number) => ({
    value,
    label:
      count === undefined
        ? pageWords.statusChips[value]
        : `${pageWords.statusChips[value]} ${count}`,
  });
  return (
    // On a phone the two groups sit on two rows, 16px apart (T8-F19).
    <div
      className={phone ? "flex flex-col items-start gap-4" : "flex flex-wrap items-center gap-2"}
    >
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
          ...(filters.workflow === undefined
            ? []
            : [
                {
                  label: pageWords.workflow(workflowName(rows, filters.workflow)),
                  pressed: true,
                  onChange: () => onChange({ ...filters, workflow: undefined }),
                },
              ]),
        ]}
      />
    </div>
  );
}

/** The workflow's name as its runs show it, or its id when it has no run yet. */
function workflowName(rows: readonly RunRow[], workflow: WorkflowRef): string {
  const run = rows.find((row) => row.hubId === workflow.hubId && row.workflowId === workflow.id);
  return run?.workflow ?? workflow.id;
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
