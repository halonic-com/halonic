import { providerNotes, type RunEvent } from "@halonicjs/events";
import { escapeHidden } from "@halonicjs/std";
import {
  Button,
  List,
  type ListColumn,
  NoteLines,
  usePresentation,
  WarningIcon,
} from "@halonicjs/studio-kit";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { DamagedRunLog, type RunsSource } from "../api.ts";
import { everyStepWords, runLogWords } from "../run-words.ts";
import { fillText } from "./blocked-sites-text.tsx";
import type { StepEntry, StepMark } from "./every-step-model.ts";
import { RunLog } from "./run-log.tsx";
import { runLogLines } from "./run-log-model.ts";
import { stepSandboxes } from "./sandbox-model.ts";
import { sandboxLineText, sayText } from "./sandbox-panel.tsx";
import { ShieldIcon } from "./shield-icon.tsx";
import { stepBlockedSites } from "./step-events-model.ts";

const timelineColumns: readonly ListColumn[] = [{ kind: "main" }, { kind: "time", key: "time" }];

/**
 * Every step (checklist part 1, 1.10): the `h2` and the timeline, a kit
 * List with one Tab stop and ↑ ↓, then **Show the run log**, which shows the
 * run's numbered events in the timeline's place and, as **Show every step**,
 * brings the timeline back. Nothing until the run's log has loaded.
 *
 * Enter or a click on an entry opens its events in the side panel; that
 * entry is the List's current row.
 *
 * The child runs a step started are named, with their links, in its side
 * panel, because a List row has no room for a link of its own yet.
 *
 * A step that ran branches or for-each items has them as rows right under
 * its entry, indented as child rows whose label names the step. They open
 * their step's panel.
 *
 * After the swap either way the toggle, which keeps focus, scrolls into view
 * at the nearest edge: it sits after what it shows, so a long run log would
 * otherwise carry its focus ring out of the window (HAL-13822).
 *
 * Under the timeline or the run log, the providers' notes on how they
 * changed the run's model calls, each once, quiet lines that need no action
 * (HAL-12317): what `halonic runs show` and `read_run` say after the steps.
 *
 * Not here yet: Show on canvas (T7).
 */
export function EveryStep({
  entries,
  log,
  openEntry,
  onOpenEntry,
}: {
  readonly entries: readonly StepEntry[];
  readonly log: readonly RunEvent[];
  /** The entry whose events the side panel shows. */
  readonly openEntry: string | undefined;
  readonly onOpenEntry: (id: string) => void;
}) {
  const place = usePresentation() === "phone" ? "phone" : "desktop";
  const [showLog, setShowLog] = useState(false);
  const lines = useMemo(() => (showLog ? runLogLines(log) : []), [showLog, log]);
  const notes = useMemo(() => providerNotes(log).map(escapeHidden), [log]);
  const toggle = useRef<HTMLButtonElement>(null);
  const swapped = useRef(false);
  useEffect(() => {
    if (!swapped.current) return;
    swapped.current = false;
    toggle.current?.scrollIntoView?.({ block: "nearest" });
  }, [showLog]);
  if (log.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col items-start gap-2">
      <div className="w-full">
        {showLog ? (
          <RunLog lines={lines} />
        ) : (
          <Timeline
            entries={entries}
            log={log}
            openEntry={openEntry}
            onOpenEntry={onOpenEntry}
            place={place}
          />
        )}
      </div>
      <NoteLines label={everyStepWords.notes} notes={notes} />
      <Button
        ref={toggle}
        variant="ghost"
        size="sm"
        onClick={() => {
          swapped.current = true;
          setShowLog(!showLog);
        }}
      >
        {showLog ? runLogWords.hide : runLogWords.show}
      </Button>
    </section>
  );
}

/** The timeline itself, nothing for a run that hasn't reached a step. */
function Timeline({
  entries,
  log,
  openEntry,
  onOpenEntry,
  place,
}: {
  readonly entries: readonly StepEntry[];
  readonly log: readonly RunEvent[];
  readonly openEntry: string | undefined;
  readonly onOpenEntry: (id: string) => void;
  readonly place: "desktop" | "phone";
}) {
  if (entries.length === 0) {
    return null;
  }
  return (
    <List
      heading={{ name: everyStepWords.heading }}
      columns={timelineColumns}
      onOpen={(id) => onOpenEntry(id.split(":")[0] ?? id)}
      {...(openEntry === undefined ? {} : { current: openEntry })}
      rows={entries.flatMap((entry) => [
        {
          id: entry.id,
          title: entry.name,
          meta: entry.line,
          icon: <StepDot mark={entry.mark} />,
          cells: { time: { value: entry.time } },
          label: entry.label,
        },
        ...sandboxRows(entry, log, place),
        ...blockedRow(entry, log),
        ...entry.groups.map((group) => ({
          id: group.id,
          title: group.name,
          meta: group.line,
          icon: <StepDot mark={group.mark} />,
          cells: { time: { value: group.time } },
          label: group.label,
          child: true as const,
        })),
      ])}
    />
  );
}

/**
 * The line under a sandboxed step (sandbox-screens 1.2): "In a sandbox · writes only in its working
 * folder · reaches only Halonic", a child row with the shield that opens the step's entry, where
 * the full list sits. A step that ran without the sandbox says so in warning tone. A step with no
 * `sandbox.opened`, an old run or a program-less step, gets no row; a damaged one says it couldn't
 * be read, quietly.
 */
function sandboxRows(entry: StepEntry, log: readonly RunEvent[], place: "desktop" | "phone") {
  return stepSandboxes(log, entry.id).map((sandbox, index) => {
    const id = `${entry.id}:sandbox-${index}`;
    if (sandbox.kind === "unreadable") {
      const title = sayText("sandbox.line.unreadable");
      return { id, title, cells: {}, label: title, child: true as const };
    }
    const off = sandbox.kind === "off";
    return {
      id,
      title: off
        ? sayText(`sandbox.line.off.${place}`)
        : `${sandboxLineText(sandbox.view)} · ${sayText("sandbox.line.link")}`,
      icon: (
        <span className={`flex size-4 ${off ? "text-warning" : "text-fg-subtle"}`}>
          <ShieldIcon />
        </span>
      ),
      cells: {},
      label: off
        ? sayText("sandbox.line.off-name", { step: entry.name })
        : `${sandboxLineText(sandbox.view)}, ${sayText("sandbox.line.link-name", { step: entry.name })}`,
      child: true as const,
    };
  });
}

/**
 * The line under a step that was refused sites: "Blocked 2 sites", a child row with the warning
 * icon (never danger: a blocked site isn't always why a step failed) that opens the step's entry,
 * where Blocked sites come first (mc 23.2). The kit's rows have no room for a button of their own.
 */
function blockedRow(entry: StepEntry, log: readonly RunEvent[]) {
  const sites = stepBlockedSites(log, entry.id).reduce(
    (count, { sites: step }) => count + step.sites.length + step.moreSites,
    0,
  );
  if (sites === 0) return [];
  const title = fillText(
    sites === 1
      ? "sandbox.blocked-sites.step-summary.one"
      : "sandbox.blocked-sites.step-summary.many",
    { count: sites },
  );
  return [
    {
      id: `${entry.id}:blocked`,
      title,
      icon: (
        <span className="flex size-4 text-warning">
          <WarningIcon />
        </span>
      ),
      cells: {},
      label: everyStepWords.blockedIn(sites, entry.name),
      child: true as const,
    },
  ];
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

/** What the run page knows of the run's log. */
export interface RunLogRead {
  /** The events read, `undefined` until a first read has worked. */
  readonly events: readonly RunEvent[] | undefined;
  /** Why the first read failed, while no read has worked; `undefined` otherwise. */
  readonly failure: unknown;
  /** The line a damaged log stops at; `undefined` for a log that reads whole. */
  readonly damagedLine: number | undefined;
  /** Reads the log again, for Try again. */
  readonly retry: () => void;
}

/**
 * One run's log, read again whenever the run moves on (`lastSeq` grows), and
 * on every list refresh until a first read has worked, so Try again reaches
 * it. When a later read fails, the page keeps the log it showed (states R18).
 * A first read that fails is reported in `failure`, not left silent, and a
 * damaged log gives the events before the damage with the line it stopped at.
 *
 * `listState` is the runs list's state: it changes on every refresh.
 */
export function useRunLog(
  source: Pick<RunsSource, "log">,
  runId: string,
  lastSeq: number,
  listState: unknown,
): RunLogRead {
  const [log, setLog] = useState<{
    readonly runId: string;
    readonly events: RunEvent[];
    readonly damagedLine: number | undefined;
  }>();
  const [failure, setFailure] = useState<{ readonly runId: string; readonly error: unknown }>();
  const [attempt, setAttempt] = useState(0);
  const read = useRef<
    | {
        source: Pick<RunsSource, "log">;
        runId: string;
        lastSeq: number;
        done: boolean;
        attempt: number;
      }
    | undefined
  >(undefined);
  useEffect(() => {
    const last = read.current;
    const sameRead =
      last?.source === source &&
      last.runId === runId &&
      last.lastSeq === lastSeq &&
      last.attempt === attempt;
    if (sameRead && last.done) {
      return;
    }
    const mine = { source, runId, lastSeq, done: false, attempt };
    read.current = mine;
    let current = true;
    source.log(runId).then(
      (events) => {
        if (current) {
          mine.done = true;
          setFailure(undefined);
          setLog({ runId, events, damagedLine: undefined });
        }
      },
      (error: unknown) => {
        if (!current) return;
        if (error instanceof DamagedRunLog) {
          mine.done = true;
          setFailure(undefined);
          setLog({ runId, events: error.events, damagedLine: error.line });
          return;
        }
        // The page says why; a log already shown stays as it was.
        setFailure({ runId, error });
      },
    );
    return () => {
      current = false;
    };
  }, [source, runId, lastSeq, listState, attempt]);
  const mine = log?.runId === runId ? log : undefined;
  return {
    events: mine?.events,
    failure: mine === undefined && failure?.runId === runId ? failure.error : undefined,
    damagedLine: mine?.damagedLine,
    retry: () => {
      setFailure(undefined);
      setAttempt((count) => count + 1);
    },
  };
}
