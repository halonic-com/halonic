import type { RunEvent } from "@halonicjs/events";
import { List, type ListColumn } from "@halonicjs/studio-kit";
import { type ReactNode, useEffect, useState } from "react";
import type { RunsSource } from "../api.ts";
import { everyStepWords } from "../run-words.ts";
import type { StepEntry, StepMark } from "./every-step-model.ts";

const timelineColumns: readonly ListColumn[] = [{ kind: "main" }, { kind: "time", key: "time" }];

/**
 * Every step (checklist part 1, 1.10): the `h2` and the timeline, a kit
 * List with one Tab stop and ↑ ↓. Nothing until the run's log has loaded.
 *
 * Not here yet: opening an entry's events in the side panel, Show the run
 * log, child runs' links, branch and for-each groups, and Show on canvas (T7).
 */
export function EveryStep({ entries }: { readonly entries: readonly StepEntry[] }) {
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
  done: "bg-success text-on-primary",
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
 * One run's log, read again whenever the run moves on (`lastSeq` grows).
 * When a later read fails, the page keeps the log it showed (states R18);
 * `undefined` until the first read.
 */
export function useRunLog(
  source: RunsSource,
  runId: string,
  lastSeq: number,
): readonly RunEvent[] | undefined {
  const [log, setLog] = useState<{ readonly runId: string; readonly events: RunEvent[] }>();
  useEffect(() => {
    let current = true;
    source.log(runId).then(
      (events) => {
        if (current) setLog({ runId, events });
      },
      () => {
        // The list's own load says the engine isn't answering; the steps stay as they were.
      },
    );
    return () => {
      current = false;
    };
  }, [source, runId, lastSeq]);
  return log?.runId === runId ? log.events : undefined;
}
