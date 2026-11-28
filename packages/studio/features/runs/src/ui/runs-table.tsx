import { shortRunId } from "@halonicjs/app";
import {
  ContentHeader,
  IconTile,
  List,
  type ListColumnsRow,
  PlaceIcon,
  StatusChip,
  shortTime,
  useFormatLocale,
} from "@halonicjs/studio-kit";
import type { AllRunsRow } from "../app/source-rows.ts";
import { runsByDay } from "../list/run-groups.ts";
import { emptyListWords, pageWords, whenWords } from "../run-words.ts";
import { tookWords } from "../time-words.ts";
import { runColumns, StartedByWithTooltip } from "./day-list.tsx";

/** The runs table's words (`runs.runs-table`; design HAL-20742, `SCREENS.md` section 2). */
export const runsTableWords = {
  title: "All runs",
  columns: {
    status: "Status",
    run: "Run",
    whatRan: "What ran",
    startedBy: "Started by",
    started: "Started",
  },
} as const;

/** Props for {@link RunsTable}. */
export interface RunsTableProps {
  readonly rows: readonly AllRunsRow[];
  readonly now: Date;
  /** The user's IANA time zone. */
  readonly timeZone: string;
  /** Whether every source has answered once; until then, with no rows yet, the loading rows show. */
  readonly loaded: boolean;
  /** Whether a source's last read, or listing the sources, failed; the list column says which. */
  readonly failed: boolean;
  /** Opens a run, for a row's click and Enter. */
  readonly onOpen: (id: string) => void;
  /** Opens a run in a new tab, for a row's Ctrl-click, Cmd-click or middle click. */
  readonly onOpenInNewTab?: (id: string) => void;
}

/**
 * The content pane while no run is open (`runs.runs-table`): "All runs" with the Runs page's
 * sentence in the kit's content-pane header, then every run in the list column as a table, newest
 * first under a heading per day, with what the list's rows have no room for: the run's short id,
 * what started it and how long it took. A click or Enter on a row opens its run, as in the list.
 * With no runs, the Runs page's loading rows stand in for the table until every source has
 * answered, then its "No runs yet", or nothing when a read failed, as the list column says so.
 */
export function RunsTable(props: RunsTableProps) {
  return (
    <section
      aria-label={runsTableWords.title}
      data-part="runs-table"
      className="flex min-w-0 flex-col"
    >
      {/* The kit's header draws a shadow where the design has a hairline; that variant is the
          kit's to add, for Code and Changes too. */}
      <ContentHeader
        picture={
          <IconTile>
            <PlaceIcon name="runs" />
          </IconTile>
        }
        title={runsTableWords.title}
        line={pageWords.sentence}
      />
      <div className="flex flex-col px-2 pb-4">
        <TableBody {...props} />
      </div>
    </section>
  );
}

/** The column names and the runs, or what stands in for them while there are none. */
function TableBody({
  rows,
  now,
  timeZone,
  loaded,
  failed,
  onOpen,
  onOpenInNewTab,
}: RunsTableProps) {
  const locale = useFormatLocale();
  if (rows.length === 0 && !loaded) {
    return (
      <List
        label={runsTableWords.title}
        rows={[]}
        columns={runColumns}
        loading
        loadingLabel={emptyListWords.loading}
      />
    );
  }
  // A failed read that left no rows isn't "No runs yet": the list column says what failed.
  if (rows.length === 0 && failed) return null;
  return (
    <>
      {rows.length === 0 ? null : <ColumnNames />}
      <List
        label={runsTableWords.title}
        groups={runsByDay(rows, { now, timeZone }).map((group) => ({
          id: group.heading,
          heading: { name: group.heading },
          rows: group.runs.map((row) => tableRow(row, { timeZone, locale })),
        }))}
        groupHeadingLevel={3}
        columns={runColumns}
        empty={{ title: emptyListWords.noRunsTitle }}
        onOpen={onOpen}
        {...(onOpenInNewTab === undefined ? {} : { onOpenInNewTab })}
      />
    </>
  );
}

/**
 * The names over the columns, for the eye: each row's sentence already says them to a screen
 * reader. The kit's List draws no column names, so the widths, the row's `px-4` and `gap-3` are
 * copies of its `columnWidthClasses` and row padding, kept in step by hand until the List names its
 * columns itself. They show only while the List draws its rows as columns (`@list-wide`).
 */
function ColumnNames() {
  const names = runsTableWords.columns;
  return (
    <div aria-hidden="true" data-part="column-names" className="@container">
      <div className="hidden min-h-9 items-center gap-3 border-b border-border px-4 text-caption text-fg-subtle @list-wide:flex">
        <span className="w-30 shrink-0">{names.status}</span>
        <span className="w-16 shrink-0">{names.run}</span>
        <span className="min-w-50 flex-1">{names.whatRan}</span>
        <span className="w-48 shrink-0">{names.startedBy}</span>
        <span className="w-24 shrink-0 text-right">{names.started}</span>
      </div>
    </div>
  );
}

/**
 * A run as a table row: its chip, with the dot while it's live (running, needs you), its short
 * id, what ran over its line, what started it, and when it started over how long it took. A
 * failed run's line is the kit's error reason, in `danger`, with the kit's error chip and its dot.
 */
function tableRow(
  row: AllRunsRow,
  clock: { timeZone: string; locale: string | undefined },
): ListColumnsRow {
  const started = new Date(row.startedAt);
  const took = row.notice.tookMs === undefined ? undefined : tookWords(row.notice.tookMs);
  return {
    id: row.id,
    title: row.title,
    meta: row.line,
    cells: {
      status: {
        value: (
          <StatusChip tone={row.chip.tone} dot={row.chip.dot === true}>
            {row.chip.word}
          </StatusChip>
        ),
      },
      run: { value: shortRunId(row.id) },
      startedBy: { value: startedByCell(row.startedBy) },
      when: {
        value: shortTime(started, started, clock.locale, clock.timeZone),
        ...(took === undefined ? {} : { detail: whenWords.took(took) }),
      },
    },
    label: row.label,
    // Failed, not Couldn't try, which the Runs page keeps neutral too.
    ...(row.chip.tone === "danger" ? { error: { reason: row.line, chip: row.chip.word } } : {}),
  };
}

/** What started the run, with the routine's name in a tooltip; nothing when no source says. */
function startedByCell(startedBy: AllRunsRow["startedBy"]) {
  if (startedBy === undefined) return null;
  if (startedBy.tooltip === undefined) return startedBy.words;
  return <StartedByWithTooltip words={startedBy.words} tooltip={startedBy.tooltip} />;
}
