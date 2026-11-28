import { shortRunId } from "@halonicjs/app";
import {
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
import { pageWords, whenWords } from "../run-words.ts";
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
  /** Opens a run, for a row's click and Enter. */
  readonly onOpen: (id: string) => void;
  /** Opens a run in a new tab, for a row's Ctrl-click, Cmd-click or middle click. */
  readonly onOpenInNewTab?: (id: string) => void;
}

/**
 * The content pane while no run is open (`runs.runs-table`): "All runs" with the Runs page's
 * sentence, then every run in the list column as a table, newest first under a heading per day,
 * with what the list's rows have no room for: the run's short id, what started it and how long it
 * took. A click or Enter on a row opens its run, as in the list.
 */
export function RunsTable({ rows, now, timeZone, onOpen, onOpenInNewTab }: RunsTableProps) {
  const locale = useFormatLocale();
  return (
    <section aria-labelledby="runs-table-title" className="flex min-w-0 flex-col">
      <header className="flex min-h-16 shrink-0 items-center gap-4 border-b border-border px-4">
        <IconTile>
          <PlaceIcon name="runs" />
        </IconTile>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 id="runs-table-title" className="truncate text-body-strong">
            {runsTableWords.title}
          </h2>
          <p className="truncate text-small text-fg-muted">{pageWords.sentence}</p>
        </div>
      </header>
      <div className="flex flex-col px-2 pb-4">
        <ColumnNames />
        <List
          label={runsTableWords.title}
          groups={runsByDay(rows, { now, timeZone }).map((group) => ({
            id: group.heading,
            heading: { name: group.heading },
            rows: group.runs.map((row) => tableRow(row, { timeZone, locale })),
          }))}
          groupHeadingLevel={3}
          columns={runColumns}
          onOpen={onOpen}
          {...(onOpenInNewTab === undefined ? {} : { onOpenInNewTab })}
        />
      </div>
    </section>
  );
}

/**
 * The names over the columns, for the eye: each row's sentence already says them to a screen
 * reader. The widths are the kit's List columns' own (`columnWidthClasses`), and the names show
 * only while the List draws its rows as columns (`@list-wide`), so they line up with the cells.
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
 * A run as a table row: its chip, with the dot while it runs or needs someone, its short id, what
 * ran over its line, what started it, and when it started over how long it took. A failed run's
 * line is the kit's error reason, in `danger`.
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
          <StatusChip
            tone={row.chip.tone}
            dot={row.phase === "running" || row.phase === "needs-you"}
          >
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
    ...(row.phase === "failed" ? { error: { reason: row.line, chip: row.chip.word } } : {}),
  };
}

/** What started the run, with the routine's name in a tooltip; nothing when the source doesn't say. */
function startedByCell(startedBy: AllRunsRow["startedBy"]) {
  if (startedBy === undefined) return null;
  if (startedBy.tooltip === undefined) return startedBy.words;
  return <StartedByWithTooltip words={startedBy.words} tooltip={startedBy.tooltip} />;
}
