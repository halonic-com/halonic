import type { RunEvent } from "@halonicjs/events";
import { Button, List, type ListColumn } from "@halonicjs/studio-kit";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { RunsSource } from "../api.ts";
import { everyStepWords, runLogWords } from "../run-words.ts";
import type { StepEntry, StepMark } from "./every-step-model.ts";
import { RunLog } from "./run-log.tsx";
import { runLogLines } from "./run-log-model.ts";

const timelineColumns: readonly ListColumn[] = [{ kind: "main" }, { kind: "time", key: "time" }];

/**
 * Every step (checklist part 1, 1.10): the `h2` and the timeline, a kit
 * List with one Tab stop and ↑ ↓, then **Show the run log**, which shows the
 * run's numbered events in the timeline's place and, as **Show every step**,
 * brings the timeline back. Nothing until the run's log has loaded.
 *
 * Not here yet: opening an entry's events in the side panel, child runs'
 * links, branch and for-each groups, and Show on canvas (T7).
 */
export function EveryStep({
  entries,
  log,
}: {
  readonly entries: readonly StepEntry[];
  readonly log: readonly RunEvent[];
}) {
  const [showLog, setShowLog] = useState(false);
  const lines = useMemo(() => (showLog ? runLogLines(log) : []), [showLog, log]);
  if (log.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col items-start gap-2">
      <div className="w-full">
        {showLog ? <RunLog lines={lines} /> : <Timeline entries={entries} />}
      </div>
      <Button variant="ghost" size="sm" onClick={() => setShowLog(!showLog)}>
        {showLog ? runLogWords.hide : runLogWords.show}
      </Button>
    </section>
  );
}

/** The timeline itself, nothing for a run that hasn't reached a step. */
function Timeline({ entries }: { readonly entries: readonly StepEntry[] }) {
  if (entries.length === 0) {
    return null;
  }
  return (
    <List
      heading={{ name: everyStepWords.heading }}
      columns={timelineColumns}
      rows={entries.map((entry) => ({
        id: entry.id,
        title: entry.name,
        meta: entry.line,
        icon: <StepDot mark={entry.mark} />,
        cells: { time: { value: entry.time } },
        label: entry.label,
      }))}
    />
  );
}

/** The ring or fill and the colour of each mark (component specs 23.5). */
const dotLooks: Record<StepMark, string> = {
  done: "bg-success text-on-success",
  failed: "bg-danger text-on-danger",
  "needs-you": "border-[1.5px] border-warning bg-warning-soft text-warning",
  running: "border-[1.5px] border-running bg-running-soft text-running",
  stopped: "border-[1.5px] border-fg-muted text-fg-muted",
};

/** A 10px line glyph in the dot's colour. */
function Glyph({ path }: { readonly path: string }) {
  return (
    <svg viewBox="0 0 16 16" className="size-2.5" fill="none" stroke="currentColor" aria-hidden>
      <path d={path} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The mark inside each dot: ✓, ×, ‖, the 6px live dot, the 6px square. */
const dotMarks: Record<StepMark, ReactNode> = {
  done: <Glyph path="M3 8.5 6.5 12 13 4.5" />,
  failed: <Glyph path="M4.5 4.5l7 7m0-7-7 7" />,
  "needs-you": <Glyph path="M6 4.5v7m4-7v7" />,
  running: <span className="size-1.5 rounded-full bg-current forced-color-adjust-none" />,
  stopped: <span className="size-1.5 bg-current forced-color-adjust-none" />,
};

/** The 16px timeline dot with its mark; colour is never alone (23 A11). */
export function StepDot({ mark }: { readonly mark: StepMark }) {
  return (
    <span
      className={`flex size-4 shrink-0 items-center justify-center rounded-full ${dotLooks[mark]}`}
      data-mark={mark}
    >
      {dotMarks[mark]}
    </span>
  );
}

/**
 * One run's log, read again whenever the run moves on (`lastSeq` grows), and
 * on every list refresh until a first read has worked, so Try again reaches
 * it. When a later read fails, the page keeps the log it showed (states R18);
 * `undefined` until the first read.
 *
 * `listState` is the runs list's state: it changes on every refresh.
 */
export function useRunLog(
  source: RunsSource,
  runId: string,
  lastSeq: number,
  listState: unknown,
): readonly RunEvent[] | undefined {
  const [log, setLog] = useState<{ readonly runId: string; readonly events: RunEvent[] }>();
  const read = useRef<
    { source: RunsSource; runId: string; lastSeq: number; done: boolean } | undefined
  >(undefined);
  useEffect(() => {
    const last = read.current;
    const sameRead = last?.source === source && last.runId === runId && last.lastSeq === lastSeq;
    if (sameRead && last.done) {
      return;
    }
    const mine = { source, runId, lastSeq, done: false };
    read.current = mine;
    let current = true;
    source.log(runId).then(
      (events) => {
        if (current) {
          mine.done = true;
          setLog({ runId, events });
        }
      },
      () => {
        // The list's own load says the engine isn't answering; the steps stay as they were.
      },
    );
    return () => {
      current = false;
    };
  }, [source, runId, lastSeq, listState]);
  return log?.runId === runId ? log.events : undefined;
}
