import {
  List,
  type ListColumn,
  type ListColumnsRow,
  StatusChip,
  useTooltip,
} from "@halonicjs/studio-kit";
import { type SampleCandidate, sampleAnswersWord } from "../list/run-model-path.ts";
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
 * The rows that may carry the "Sample answers" chip (`runs.sample-chip`): runs that wait or are
 * done, not a test case's, whose test model is the test's own and no stand-in for a real one.
 */
export function sampleCandidates(rows: readonly RunRow[]): SampleCandidate[] {
  const shown = new Set(["needs-you", "waiting", "done"]);
  return rows
    .filter((row) => !row.test && shown.has(row.standing))
    .map((row) => ({ id: row.id, standing: row.standing }));
}

/**
 * The runs in one list, under an `h2` for each day they started, right under the page's `h1` as
 * Workflows and Routines head their groups; ↑ ↓ pass over them. A click or Enter on a row opens
 * its run.
 */
export function DayList({
  rows,
  openRow,
  samples,
  now,
}: {
  readonly rows: readonly RunRow[];
  readonly openRow: ((id: string) => void) | undefined;
  /** The ids of the runs on Sample answers, whose rows carry its chip. */
  readonly samples: ReadonlySet<string>;
  readonly now: Date;
}) {
  return (
    <List
      label={pageWords.title}
      groups={dayGroups(rows, now).map((group) => ({
        id: group.day,
        heading: { name: group.day },
        rows: group.rows.map((row) => listRow(row, samples.has(row.id))),
      }))}
      groupHeadingLevel={2}
      columns={runColumns}
      {...(openRow === undefined ? {} : { onOpen: openRow })}
    />
  );
}

/**
 * A run as a List row: its chip, short id, what ran over its line with its
 * Test tag or Sample answers chip, what started it, with the routine's name in a tooltip, and when
 * it started. A failed row's line is the kit's error reason, in `danger`,
 * with the Failed chip. The tag sits after the title, and on a phone under the line, so the full
 * name fits.
 */
function listRow(row: RunRow, sample: boolean): ListColumnsRow {
  const tag = tagOf(row, sample);
  return {
    id: row.id,
    title: row.workflow,
    meta: row.line,
    ...(tag === undefined ? {} : { tag: <StatusChip tone="outline">{tag}</StatusChip> }),
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
    // The sentence ends with a full stop; a run on Sample answers says so before it.
    label: sample && !row.test ? `${row.label.slice(0, -1)}, on ${sampleAnswersWord}.` : row.label,
    ...(row.standing === "failed" ? { error: { reason: row.line, chip: row.chip.word } } : {}),
  };
}

/** The tag after the title: Test for a test case's run, else Sample answers on that path. */
function tagOf(row: RunRow, sample: boolean): string | undefined {
  if (row.test) return pageWords.testTag;
  return sample ? sampleAnswersWord : undefined;
}

/**
 * A schedule's Started by, with the routine's name in a tooltip. `useTooltip`, not `Tooltip`: its
 * `inline-flex` wrapper can't be cut, so a long schedule on a phone's row would show as "…" alone.
 * As plain inline text it's cut like any other (HAL-12829).
 */
export function StartedByWithTooltip({
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
