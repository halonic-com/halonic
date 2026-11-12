import type { ReactNode } from "react";
import { List } from "../../src/list/list.tsx";
import type { ListColumn, ListColumnsRow, ListGroup } from "../../src/list/list-props.ts";
import { StatusChip } from "../../src/status-chip/status-chip.tsx";
import type { PartSection } from "../state-table.tsx";

const ignore = () => undefined;

/** The Runs list's columns, in `halonic runs`' order (T8-F1). */
const runColumns: readonly ListColumn[] = [
  { kind: "status", key: "status" },
  { kind: "code", key: "run" },
  { kind: "main" },
  { kind: "text", key: "startedBy" },
  { kind: "time", key: "when" },
];

interface RunCase {
  readonly id: string;
  readonly title: string;
  readonly meta: string;
  readonly chip: ReactNode;
  readonly startedBy: string;
  readonly when: string;
  readonly took?: string;
  readonly test?: boolean;
}

/** A Runs row from the case's words. A screen reads its words from its own words file. */
function runRow(run: RunCase): ListColumnsRow {
  return {
    id: run.id,
    title: run.title,
    meta: run.meta,
    ...(run.test === true ? { tag: <StatusChip tone="outline">Test</StatusChip> } : {}),
    cells: {
      status: { value: run.chip },
      run: { value: run.id },
      startedBy: { value: run.startedBy },
      when: { value: run.when, ...(run.took === undefined ? {} : { detail: run.took }) },
    },
    label: `Run ${run.id}, ${run.title}, ${run.meta}. Started by ${run.startedBy}, ${run.when}.`,
    more: { label: `More actions for run ${run.id}`, onClick: ignore },
  };
}

const running = runRow({
  id: "01JDA4",
  title: "Support reply",
  meta: "In Classify",
  chip: (
    <StatusChip tone="running" dot>
      Running
    </StatusChip>
  ),
  startedBy: "Test “spam”",
  when: "10:53",
  test: true,
});

const needsYou = runRow({
  id: "01JD9A",
  title: "Support reply",
  meta: "Waiting for you: Approve this reply?",
  chip: (
    <StatusChip tone="warning" dot>
      Needs you
    </StatusChip>
  ),
  startedBy: "A message arrived",
  when: "10:44",
});

const budget = runRow({
  id: "01JD8H",
  title: "Support reply",
  meta: "Budget reached in Draft after 3 min · 1 email drafted · estimated cost €0.05",
  chip: <StatusChip tone="warning">Stopped · budget</StatusChip>,
  startedBy: "Test “Refund over €100 for a customer in another country”",
  when: "07:12",
  took: "took 3 min",
});

const failed: ListColumnsRow = {
  ...runRow({
    id: "01JD6M",
    title: "Support reply",
    meta: "",
    chip: null,
    startedBy: "A message arrived",
    when: "16:40",
    took: "took 1 min",
  }),
  label:
    "Run 01JD6M, Support reply, failed in the step Review. Started by A message arrived, 16:40.",
  error: {
    reason: "Support reply failed in the step Review. Halonic can’t tell the cause from the log.",
    chip: "Failed",
  },
};

const days: readonly ListGroup<string, ListColumnsRow>[] = [
  { id: "today", heading: { name: "Today" }, rows: [running, needsYou, budget] },
  { id: "yesterday", heading: { name: "Yesterday" }, rows: [failed] },
];

/** The Runs list at a width: from 800px the columns sit side by side, below it they stack. */
function Runs({ width }: { readonly width: "wide" | "narrow" }) {
  return (
    <div className={width === "wide" ? "w-full max-w-page" : "w-150 max-w-full"}>
      <List label="Runs" groups={days} columns={runColumns} onOpen={ignore} />
    </div>
  );
}

/** Hover and focus go on the first run, where the keyboard puts focus. */
const firstRun = "tbody:first-of-type tr:nth-child(2)";
const firstRunCell = `${firstRun} > td:first-child`;

export const listColumnsSection: PartSection = {
  id: "list-columns",
  number: "6",
  name: "List with columns",
  order:
    "kit 6, HAL-6764 · the Runs list: status, run, what ran, started by, when; side by side from 800px, stacked below",
  notApplicable: "read-only, busy, empty and loading (as the List)",
  stacked: true,
  rows: [
    { name: "Default", copies: () => <Runs width="wide" /> },
    { name: "Narrow", copies: () => <Runs width="narrow" /> },
    { name: "Hover", force: "hover", target: firstRun, copies: () => <Runs width="wide" /> },
    { name: "Focus", force: "focus", target: firstRunCell, copies: () => <Runs width="wide" /> },
  ],
};
