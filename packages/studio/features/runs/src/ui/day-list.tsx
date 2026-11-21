import {
  List,
  type ListColumn,
  type ListColumnsRow,
  StatusChip,
  useTooltip,
} from "@halonicjs/studio-kit";
import type { RunRow } from "../list/run-row.ts";
import { dayGroups } from "../list/runs-filter.ts";
import { pageWords } from "../run-words.ts";

/** A row's columns, in `halonic runs`' order (checklist 1.2; T8-F1). */
export const runColumns: readonly ListColumn[] = [
  { kind: "status", key: "status" },
  { kind: "code", key: "run" },
  { kind: "main" },
  { kind: "text", key: "startedBy" },
  { kind: "time", key: "when" },
];

/**
 * The runs in one list, under an `h2` for each day they started, right under the page's `h1` as
 * Workflows and Routines head their groups; ↑ ↓ pass over them. A click or Enter on a row opens
 * its run.
 */
export function DayList({
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
      groupHeadingLevel={2}
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
            <StartedByWithTooltip words={row.startedBy} tooltip={row.startedByTooltip} />
          ),
      },
      when: { value: row.time, ...(row.took === undefined ? {} : { detail: row.took }) },
    },
    label: row.label,
    ...(row.standing === "failed" ? { error: { reason: row.line, chip: row.chip.word } } : {}),
  };
}

/**
 * A schedule's Started by, with the routine's name in a tooltip. `useTooltip`, not `Tooltip`: its
 * `inline-flex` wrapper can't be cut, so a long schedule on a phone's row would show as "…" alone.
 * As plain inline text it's cut like any other (HAL-12829).
 */
function StartedByWithTooltip({
  words,
  tooltip,
}: {
  readonly words: string;
  readonly tooltip: string;
}) {
  const { anchor, trigger, popover } = useTooltip({ text: tooltip });
  return (
    <>
      <span {...anchor} {...trigger}>
        {words}
      </span>
      {popover}
    </>
  );
}
