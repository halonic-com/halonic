import type { ComparedRun, ComparedTest, LogEvent } from "./run-logs.ts";

/**
 * One way the run logs may differ, as code. An allowed difference names the
 * rules it allows in `runRules`; the run-log compare applies the rules of
 * every entry, in the order of {@link runRules}, before it compares. A rule
 * only takes out or reorders what its `does` says, on the side it names.
 */
export interface RunRule {
  readonly id: string;
  /** What the rule takes out or reorders, in plain words. */
  readonly does: string;
  readonly old?: (test: ComparedTest) => ComparedTest;
  readonly new?: (test: ComparedTest) => ComparedTest;
}

type Json = Readonly<Record<string, unknown>>;

function omit(value: Json, keys: readonly string[]): Json {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
}

function eachRun(test: ComparedTest, change: (run: ComparedRun) => ComparedRun): ComparedTest {
  return { ...test, runs: test.runs.map(change) };
}

/** Changes the events of every run, then numbers them again from 1, as a log does. */
function eachLog(
  test: ComparedTest,
  change: (events: readonly LogEvent[]) => readonly LogEvent[],
): ComparedTest {
  return eachRun(test, (run) => ({
    ...run,
    events: change(run.events).map((event, index) => ({ ...event, seq: index + 1 })),
  }));
}

function eachEvent(test: ComparedTest, type: string, change: (event: LogEvent) => LogEvent) {
  return eachRun(test, (run) => ({
    ...run,
    events: run.events.map((event) => (event["type"] === type ? change(event) : event)),
  }));
}

/** Replaces every string that is exactly a key of `names`, anywhere in the value. */
function rename(value: unknown, names: ReadonlyMap<string, string>): unknown {
  if (typeof value === "string") return names.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => rename(item, names));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, rename(item, names)]),
    );
  }
  return value;
}

/**
 * Sorts each stretch of events that `inStretch` keeps together by `keyOf`,
 * keeping the order of events with the same key.
 */
function sortStretches(
  events: readonly LogEvent[],
  inStretch: (event: LogEvent) => boolean,
  keyOf: (event: LogEvent) => string | number,
): LogEvent[] {
  const sorted: LogEvent[] = [];
  let stretch: LogEvent[] = [];
  const flush = () => {
    sorted.push(
      ...stretch
        .map((event, index) => ({ event, index }))
        .sort((a, b) => {
          const [x, y] = [keyOf(a.event), keyOf(b.event)];
          if (x === y) return a.index - b.index;
          return x < y ? -1 : 1;
        })
        .map(({ event }) => event),
    );
    stretch = [];
  };
  for (const event of events) {
    if (!inStretch(event)) flush();
    (inStretch(event) ? stretch : sorted).push(event);
  }
  flush();
  return sorted;
}

/** The run IDs of a test, `run_1` for its own run and on in the order its runs started. */
function byStart(test: ComparedTest): ComparedTest {
  const names = new Map(
    test.runs.map((run, index) => [String(run.summary["id"]), `run_${index + 1}`]),
  );
  return rename(test, names) as ComparedTest;
}

const withoutVersion = (test: ComparedTest): ComparedTest =>
  eachEvent(
    eachRun(test, (run) => ({ ...run, summary: omit(run.summary, ["definitionsVersion"]) })),
    "run.started",
    (event) => omit(event, ["definitionsVersion"]),
  );

/** The summary fields the new engine adds; the old `approval` is the new `approvals` list. */
const newSummaryFields = [
  "subscriptionCalls",
  "reason",
  "answerLabels",
  "waitingFor",
  "lastWaitingAt",
  "approvals",
  "cantTry",
  "lastSeq",
  "updatedAt",
];

/** Branch events in name order, then the context the branches wrote, by key. */
function branchesByName(events: readonly LogEvent[]): LogEvent[] {
  const inBranch = (event: LogEvent) => typeof event["branch"] === "string";
  const branches = new Set(events.filter(inBranch).map((event) => String(event["branch"])));
  const byBranch = sortStretches(events, inBranch, (event) => String(event["branch"]));
  const branchResult = (event: LogEvent) =>
    event["type"] === "context.updated" && branches.has(String(event["key"]));
  return sortStretches(byBranch, branchResult, (event) => String(event["key"]));
}

/** Every run-log rule, in the order the compare applies them. */
export const runRules: readonly RunRule[] = [
  {
    id: "run-ids-by-start",
    does: "names each run of a test run_1, run_2, ... in the order it started, on both sides",
    old: byStart,
    new: byStart,
  },
  {
    id: "no-definitions-version",
    does: "takes definitionsVersion out of run.started and the summary, on both sides",
    old: withoutVersion,
    new: withoutVersion,
  },
  {
    id: "waiting-labels-and-title",
    does: "takes labels and title out of the new run.waiting",
    new: (test) => eachEvent(test, "run.waiting", (event) => omit(event, ["labels", "title"])),
  },
  {
    id: "child-context-in-finished",
    does: "takes context out of the new workflow.finished",
    new: (test) => eachEvent(test, "workflow.finished", (event) => omit(event, ["context"])),
  },
  {
    id: "summary-new-fields",
    does: `takes the old summary's approval and the new summary's ${newSummaryFields.join(", ")} out`,
    old: (test) => eachRun(test, (run) => ({ ...run, summary: omit(run.summary, ["approval"]) })),
    new: (test) =>
      eachRun(test, (run) => ({ ...run, summary: omit(run.summary, newSummaryFields) })),
  },
  {
    id: "foreach-items-in-order",
    does: "sorts each stretch of a foreach's item events by item, on both sides",
    old: (test) => eachLog(test, (events) => itemsInOrder(events)),
    new: (test) => eachLog(test, (events) => itemsInOrder(events)),
  },
  {
    id: "parallel-branches-by-name",
    does: "sorts each stretch of the old parallel branch events, and the context they wrote, by branch name",
    old: (test) => eachLog(test, branchesByName),
  },
];

function itemsInOrder(events: readonly LogEvent[]): LogEvent[] {
  return sortStretches(
    events,
    (event) => typeof event["item"] === "number",
    (event) => Number(event["item"]),
  );
}

/** The rule with this id, or undefined. */
export function runRule(id: string): RunRule | undefined {
  return runRules.find((rule) => rule.id === id);
}
