import { EmptyState, SkeletonBar, StatusChip, usePresentation } from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import type { RoutineRun, RoutineRuns, RoutinesHost, RoutineView } from "../api.ts";
import { useNextTimes } from "../when/use-next-times.ts";
import {
  nextRunWords,
  outcomeWords,
  queuedSentence,
  runsWords,
  runTime,
  skipName,
  skipSentence,
  startedByWords,
} from "./runs-words.ts";
import type { RoutineRunsLoad } from "./use-routine-runs.ts";

/** Props for {@link RunsView}. */
export interface RunsViewProps {
  readonly host: RoutinesHost;
  readonly routine: RoutineView;
  readonly load: RoutineRunsLoad;
  readonly retry: () => void;
  /** Opens a run's page; without it the rows are not links. */
  readonly openRun?: ((runId: string) => void) | undefined;
  readonly now?: Date;
}

/** One row of the Earlier list: a run, or a range of times that didn't start. */
type Entry =
  | { readonly kind: "run"; readonly at: string; readonly run: RoutineRun }
  | { readonly kind: "skip"; readonly at: string; readonly text: string; readonly name?: string };

/** Whether a run still goes or waits for a person: those sit under Now. */
const isNow = (run: RoutineRun): boolean => run.outcome === "running" || run.outcome === "waiting";

/**
 * The routine's Runs view (`routines.runs.view`, flow-routines 3.9): **Now** (running runs, runs
 * that wait for a person, and one quiet row for queued times), then **Earlier** with the other
 * runs and the times that didn't start, newest first.
 */
export function RunsView({ host, routine, load, retry, openRun, now = new Date() }: RunsViewProps) {
  if (load.kind === "loading") {
    return (
      <div role="status" className="flex flex-col gap-3">
        <span className="sr-only">{runsWords.loading}</span>
        <SkeletonBar kind="value" />
      </div>
    );
  }
  if (load.kind === "failed") {
    return (
      <EmptyState
        tone="error"
        title={runsWords.loadFailedTitle}
        description={load.reason}
        action={{ label: runsWords.tryAgain, onClick: retry, busy: load.retrying }}
      />
    );
  }
  return <RunsLists host={host} routine={routine} runs={load.runs} openRun={openRun} now={now} />;
}

function RunsLists({
  host,
  routine,
  runs,
  openRun,
  now,
}: {
  readonly host: RoutinesHost;
  readonly routine: RoutineView;
  readonly runs: RoutineRuns;
  readonly openRun: ((runId: string) => void) | undefined;
  readonly now: Date;
}) {
  const going = runs.runs.filter(isNow);
  const earlier: Entry[] = [
    ...runs.runs
      .filter((run) => !isNow(run))
      .map((run): Entry => ({ kind: "run", at: run.startedAt, run })),
    ...runs.skips.map((skip): Entry => {
      const name = skipName(skip, now);
      return {
        kind: "skip",
        at: skip.to,
        text: skipSentence(skip, routine.targetName, now),
        ...(name === undefined ? {} : { name }),
      };
    }),
  ].sort((first, second) => second.at.localeCompare(first.at));
  const empty = going.length === 0 && earlier.length === 0 && runs.queued === undefined;
  if (empty) return <NoRuns host={host} routine={routine} />;
  return (
    <div className="flex flex-col gap-4">
      {(going.length > 0 || runs.queued !== undefined) && (
        <Section title={runsWords.now}>
          {going.map((run) => (
            <RunRow key={run.runId} run={run} openRun={openRun} now={now} />
          ))}
          {runs.queued && (
            <QuietRow hidden={runsWords.queuedPrefix} text={queuedSentence(runs.queued, now)} />
          )}
        </Section>
      )}
      {earlier.length > 0 && (
        <Section title={runsWords.earlier}>
          {earlier.map((entry) =>
            entry.kind === "run" ? (
              <RunRow key={entry.run.runId} run={entry.run} openRun={openRun} now={now} />
            ) : (
              <QuietRow key={`${entry.at}-${entry.text}`} text={entry.text} name={entry.name} />
            ),
          )}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="text-caption uppercase text-fg-muted">{title}</h2>
      <ul className="flex flex-col">{children}</ul>
    </section>
  );
}

/** "No runs yet." with when it runs next, or how to start one by hand. */
function NoRuns({ host, routine }: { readonly host: RoutinesHost; readonly routine: RoutineView }) {
  const automatic = routine.enabled && routine.trigger.kind !== "manual";
  const next = useNextTimes(host, routine, automatic, routine)?.times[0];
  const description =
    next === undefined ? runsWords.emptyManual : runsWords.emptyAfter(nextRunWords(next));
  return <EmptyState title={runsWords.emptyTitle} description={description} />;
}

const outcomeTone = {
  running: { tone: "running", dot: true },
  waiting: { tone: "warning", dot: true },
  completed: { tone: "success", dot: false },
  failed: { tone: "danger", dot: false },
  "cant-try": { tone: "neutral", dot: false },
} as const;

/** A run: its chip, short id, what started it and when; opens the run's page. */
function RunRow({
  run,
  openRun,
  now,
}: {
  readonly run: RoutineRun;
  readonly openRun: ((runId: string) => void) | undefined;
  readonly now: Date;
}) {
  const { tone, dot } = outcomeTone[run.outcome];
  const phone = usePresentation() === "phone";
  const chip = (
    <StatusChip tone={tone} dot={dot}>
      {outcomeWords[run.outcome]}
    </StatusChip>
  );
  const by = (
    <span className="min-w-0 flex-1 truncate text-small text-fg-muted">
      {startedByWords[run.startedBy]}
    </span>
  );
  const time = runTime(run.startedAt, now);
  const when = <span className="text-small text-fg-muted">{time}</span>;
  // On a phone the row has two lines: chip, id and time, then what started it.
  const content = phone ? (
    <span className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="flex items-center gap-3">
        {chip}
        <span className="flex-1 font-mono text-small">{run.shortId}</span>
        {when}
      </span>
      {by}
    </span>
  ) : (
    <>
      {chip}
      <span className="font-mono text-small">{run.shortId}</span>
      {by}
      {when}
    </>
  );
  const classes = `flex min-h-control-md w-full items-center gap-3 py-1 text-start ${
    phone ? "px-0" : "px-2"
  }`;
  return (
    <li>
      {openRun === undefined ? (
        <div className={classes}>{content}</div>
      ) : (
        <button
          type="button"
          className={`${classes} rounded-sm hover:bg-surface-muted focus-ring`}
          aria-label={runsWords.rowName(
            run.shortId,
            outcomeWords[run.outcome],
            startedByWords[run.startedBy],
            time,
          )}
          onClick={() => openRun(run.runId)}
        >
          {content}
        </button>
      )}
    </li>
  );
}

/**
 * A time that didn't start, or a queue: plain muted text, not a link, no id or chip. `name`, when
 * given, is what a screen reader hears instead of the text.
 */
function QuietRow({
  text,
  hidden,
  name,
}: {
  readonly text: string;
  readonly hidden?: string;
  readonly name?: string | undefined;
}) {
  return (
    <li className="min-h-control-md px-2 py-1 text-small text-fg-muted">
      {hidden !== undefined && <span className="sr-only">{hidden}</span>}
      {name === undefined ? (
        text
      ) : (
        <>
          <span aria-hidden="true">{text}</span>
          <span className="sr-only">{name}</span>
        </>
      )}
    </li>
  );
}
