import { type SandboxStartCheck, sandboxStartCheckKey, shortRunId } from "@halonicjs/app";
import { type RunEvent, type RunSummary, type RunVersion, summarize } from "@halonicjs/events";
import { Callout, EmptyState, List, usePresentation } from "@halonicjs/studio-kit";
import {
  type EngineWords,
  engineWordsOf,
  ItemGone,
  type ItemViewProps,
  PageBackLinkSlot,
} from "@halonicjs/studio-shell";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  type InstructionTrustHost,
  InstructionTrustHostService,
  type RunStartHost,
  RunStartHostService,
  type SourcedRun,
} from "../api.ts";
import { FailureReason } from "../load-failure.tsx";
import { runPageWords } from "../run-words.ts";
import { type RunsList, RunsListService } from "../runs-list.ts";
import { Details, type DetailsProps, DetailsRow } from "./details.tsx";
import { detailRows } from "./details-model.ts";
import { EveryStep, useRunLog } from "./every-step.tsx";
import { entryIdOfStep, everyStep, type StepEntry } from "./every-step-model.ts";
import { PageBanner } from "./page-banner.tsx";
import { Receipt } from "./receipt.tsx";
import {
  approvalLines,
  messageLines,
  modelLines,
  readLines,
  summaryLine,
} from "./receipt-model.ts";
import { useRunAgain } from "./run-again.ts";
import { LogUnread, RunLayout } from "./run-layout.tsx";
import type { RunPageContext } from "./run-page-model.ts";
import { slowStepDueAt } from "./slow-step.ts";
import { StepPanel } from "./step-panel.tsx";
import { useRunChanges } from "./use-run-changes.ts";

/** The command that opens the workspace page at Models (`features/workspace`). */
const openModelsCommand = "workspace.open-models";

/** The `run` item kind's page: one run of the open workspace, from `RunsListService`. */
export function RunPage({ item, context, step, asked }: ItemViewProps) {
  const { openPlace, openItem } = context;
  const instructionTrust = context.services.find(InstructionTrustHostService);
  const sandboxStartCheck = context.services.find(sandboxStartCheckKey);
  const runStart = context.services.find(RunStartHostService);
  return (
    <RunView
      list={context.services.get(RunsListService)}
      runId={item.id}
      engine={engineWordsOf(context)}
      {...(step === undefined ? {} : { step })}
      {...(asked === undefined ? {} : { asked })}
      {...(instructionTrust === undefined ? {} : { instructionTrust })}
      {...(sandboxStartCheck === undefined ? {} : { sandboxStartCheck })}
      announce={(line) => context.announcer.announce(line)}
      announceState={(key, text) => context.announcer.announceState(key, text)}
      {...(context.runCommand === undefined
        ? {}
        : { openModels: () => void context.runCommand?.(openModelsCommand) })}
      {...(runStart === undefined ? {} : { runStart })}
      {...(openPlace === undefined
        ? {}
        : { goToRuns: () => openPlace("runs"), reviewInInbox: () => openPlace("inbox") })}
      {...(openItem === undefined
        ? {}
        : {
            openRun: (runId: string) => openItem({ kind: "run", hub: item.hub, id: runId }),
          })}
    />
  );
}

/** Props for {@link RunView}. */
export interface RunViewProps {
  readonly list: RunsList;
  readonly runId: string;
  /**
   * The id of a step of the run's workflow to open on, as the workflow page's **See what went in
   * and out ›** asks for. A step the run didn't reach opens the page at the top.
   */
  readonly step?: string;
  /**
   * How many times the tab was asked for a step (`TabLocation.asked`). A page that is open
   * already goes to the step again when this changes, also when it is the same step twice.
   */
  readonly asked?: number;
  /** Asks to trust an agent's instructions; absent on a served page or a phone, which can't ask. */
  readonly instructionTrust?: InstructionTrustHost;
  /** Checks the sandbox again, for the banner of a run it refused; absent where nothing can check. */
  readonly sandboxStartCheck?: SandboxStartCheck;
  /** Says a line to a screen reader, for the answer to a press in a banner; absent in tests that don't listen. */
  readonly announce?: (line: string) => void;
  /** Reads the run's new state when it changes (`announcer.announceState`); absent in tests that don't listen. */
  readonly announceState?: (key: string, text: string) => void;
  /** Starts a run, for Run again; absent where there is no engine, and the button isn't there. */
  readonly runStart?: RunStartHost;
  /** Opens the workspace page at Models, for **Open Models** on a failed banner; without it the button isn't there. */
  readonly openModels?: () => void;
  /** Opens the Runs list, for a run that isn't there any more. */
  readonly goToRuns?: () => void;
  /** Opens the Inbox, for Review in Inbox; without it the button isn't there. */
  readonly reviewInInbox?: () => void;
  /** Opens another run's page, for a child run; without it the button isn't there. */
  readonly openRun?: (runId: string) => void;
  /** The clock for the start time and due times; tests pass a fixed one. */
  readonly now?: () => Date;
  /** What the page calls the engine when it isn't answering, for this window's host; the desktop app's by default. */
  readonly engine?: EngineWords;
}

/**
 * The run page (checklist part 1, 1.5, 1.6 and 1.8): the
 * header, then a banner only when the run needs attention. It reads the same
 * runs as the Runs list, so it updates in place as the run moves on (R14,
 * D1), and keeps what it showed when a later load fails (R18).
 *
 * Under them, Every step, from the run's log.
 *
 * Above them, the receipt's summary line; its sections come in the next pull requests.
 *
 * **Run again** starts a new run of the same workflow with the same input and opens it. It is in
 * the header of an ended real run, and on the failed banner that has no button of its own.
 *
 * Not here yet: the header's ⋮.
 *
 * On a phone (1.15) it is one column: the heading is for screen readers (the top bar says "Run
 * #42"), Details is one row that opens a sheet, and a step's events fill the screen with Back.
 * Not on the phone yet: the ⋮, the 48px link rows in the header, and the receipt's **Show each
 * call** sheet.
 */
export function RunView({
  list,
  runId,
  step,
  asked,
  instructionTrust,
  sandboxStartCheck,
  announce,
  announceState,
  runStart,
  openModels,
  goToRuns,
  reviewInInbox,
  openRun,
  now = () => new Date(),
  engine = engineWordsOf({}),
}: RunViewProps) {
  const phone = usePresentation() === "phone";
  const subscribe = useCallback((listener: () => void) => list.subscribe(listener), [list]);
  const state = useSyncExternalStore(subscribe, () => list.state);
  const run = state.runs.find((candidate) => candidate.summary.id === runId);
  const logRead = useRunLog(list.source, runId, run?.summary.lastSeq ?? 0, state);
  const log = logRead.events;
  const [openEntry, setOpenEntry] = useOpenEntry(runId, step, asked, log, run?.summary);
  useRedrawWhenSlow(log, run?.summary.status === "running", now);
  useEffect(() => list.noteOpened(runId), [list, runId]);
  const title = runPageWords.title(shortRunId(runId));
  const retry = () => void list.refresh();
  const runAgain = useRunAgain(runStart, run, log, openRun, engine, announce);
  const page = useRunChanges(
    run,
    log,
    (shown) => pageContext(list, state.runs, shown, now()),
    announceState,
  );

  if (run !== undefined) {
    const context = pageContext(list, state.runs, run, now());
    // The log's own summary, so each step's end agrees with the log it came from.
    const entries =
      log === undefined
        ? []
        : everyStep(log, summarize(log) ?? run.summary, context.workflow, context.now);
    const open = entries.find((entry) => entry.id === openEntry);
    return (
      <div ref={page} className="flex min-h-full w-full items-start">
        <RunLayout
          run={run}
          context={context}
          refreshError={state.error}
          engine={engine}
          phone={phone}
          runAgain={runAgain}
        >
          <PageBanner
            run={run}
            context={context}
            log={log}
            entries={entries}
            reviewInInbox={reviewInInbox}
            openRun={openRun}
            instructionTrust={{ host: instructionTrust }}
            sandboxStartCheck={sandboxStartCheck}
            announce={announce}
            runAgain={runAgain}
            openModels={openModels}
            phone={phone}
            onSeeStep={setOpenEntry}
          />
          <DamagedLogBanner line={logRead.damagedLine} />
          <div
            className={
              phone
                ? "flex flex-col gap-4"
                : "grid items-start gap-6 wide:grid-cols-[minmax(0,1fr)_16rem]"
            }
          >
            <div className="flex min-w-0 flex-col gap-4">
              <ReceiptAndSteps
                run={run}
                context={context}
                log={log}
                logRead={logRead}
                engine={engine}
                entries={entries}
                openEntry={open?.id}
                onOpenEntry={setOpenEntry}
              />
            </div>
            <RunDetails
              phone={phone}
              rows={detailRows(run, context, routineOf(list, run))}
              version={startedVersion(log)}
              logRead={log !== undefined}
              runId={run.summary.id}
              now={context.now}
            />
          </div>
        </RunLayout>
        {open === undefined || log === undefined ? null : (
          // A new key for each entry, so its panel takes focus as it opens.
          <StepPanel
            key={open.id}
            entry={open}
            log={log}
            workflowName={(workflowId) => workflowName(list, run, workflowId)}
            openRun={openRun}
            phone={phone}
            live={run.summary.endedAt === null}
            onClose={() => setOpenEntry(undefined)}
          />
        )}
      </div>
    );
  }
  if (state.loaded) {
    return <RunNotHere goToRuns={goToRuns} />;
  }
  return (
    <div className={`flex w-full flex-col gap-4 ${phone ? "px-4 py-4" : "px-6 py-5"}`}>
      <PageBackLinkSlot />
      <h1 className={phone ? "sr-only" : "text-title"}>{title}</h1>
      {state.error === undefined ? (
        <List
          label={title}
          rows={[]}
          loading
          loadingLabel={runPageWords.loading(shortRunId(runId))}
          onRetry={retry}
        />
      ) : (
        <EmptyState
          tone="error"
          align="start"
          title={runPageWords.loadFailed(shortRunId(runId))}
          description={
            <FailureReason
              what={runPageWords.loadFailed(shortRunId(runId))}
              error={state.error}
              engine={engine}
            />
          }
          action={{ label: "Try again", onClick: retry }}
        />
      )}
    </div>
  );
}

/** A run that isn't in the workspace (any more): the shell's gone page when it can open the list. */
function RunNotHere({ goToRuns }: { readonly goToRuns: (() => void) | undefined }) {
  return goToRuns === undefined ? (
    <EmptyState title={runPageWords.notHere} />
  ) : (
    <ItemGone kindName="run" place="Runs" onGoTo={goToRuns} />
  );
}

/** The receipt and Every step, or what stands in their place while the log isn't read. */
function ReceiptAndSteps({
  run,
  context,
  log,
  logRead,
  engine,
  entries,
  openEntry,
  onOpenEntry,
}: {
  readonly run: SourcedRun;
  readonly context: RunPageContext;
  readonly log: readonly RunEvent[] | undefined;
  readonly logRead: ReturnType<typeof useRunLog>;
  readonly engine: EngineWords;
  readonly entries: readonly StepEntry[];
  readonly openEntry: string | undefined;
  readonly onOpenEntry: (entryId: string | undefined) => void;
}) {
  if (log === undefined) {
    return <LogUnread failure={logRead.failure} retry={logRead.retry} engine={engine} />;
  }
  return (
    <>
      <Receipt
        summary={summaryLine(run, log, context)}
        approvals={approvalLines(log)}
        messages={messageLines(log)}
        reads={readLines(log)}
        models={modelLines(log, run.summary, context.currency)}
      />
      <EveryStep log={log} entries={entries} openEntry={openEntry} onOpenEntry={onOpenEntry} />
    </>
  );
}

/** Details beside the page on the desktop, one row that opens a sheet on a phone. */
function RunDetails({ phone, ...details }: DetailsProps & { readonly phone: boolean }) {
  return phone ? <DetailsRow {...details} /> : <Details {...details} />;
}

/**
 * The entry the step panel shows, and how to change it. The step the page was asked to open on
 * (`step`) opens its entry once per run, when the log is first read; closing it doesn't open it
 * again. A live run that hadn't reached the step by then opens at the top.
 */
function useOpenEntry(
  runId: string,
  step: string | undefined,
  asked: number | undefined,
  log: readonly RunEvent[] | undefined,
  summary: RunSummary | undefined,
) {
  const [openEntry, setOpenEntry] = useState<string>();
  const [opened, setOpened] = useState<string>();
  const request = step === undefined ? undefined : `${runId}/${step}/${asked ?? 0}`;
  if (step !== undefined && request !== opened && log !== undefined && summary !== undefined) {
    setOpened(request);
    setOpenEntry(entryIdOfStep(log, summarize(log) ?? summary, step));
  }
  return [openEntry, setOpenEntry] as const;
}

/**
 * Draws the page again at the moment the log's last event turns 10 seconds old, so a step that
 * waits gets its line (F3) although nothing new was written. A new event moves the moment on.
 */
function useRedrawWhenSlow(
  log: readonly RunEvent[] | undefined,
  running: boolean,
  now: () => Date,
) {
  const [, redraw] = useState(0);
  const due = running && log !== undefined ? slowStepDueAt(log) : undefined;
  const dueTime = due?.getTime();
  useEffect(() => {
    if (dueTime === undefined) return;
    const wait = dueTime - now().getTime();
    if (wait <= 0) return;
    const timer = setTimeout(() => redraw((count) => count + 1), wait);
    return () => clearTimeout(timer);
  }, [dueTime, now]);
}

/** The red banner for a log with a damaged line; nothing for a log that reads whole. */
export function DamagedLogBanner({ line }: { readonly line: number | undefined }) {
  if (line === undefined) return null;
  return (
    <section aria-label={runPageWords.damagedLogName}>
      <Callout tone="danger">{runPageWords.damagedLog(line)}</Callout>
    </section>
  );
}

/** The routine that started the run, when it has one and the workspace still has it. */
function routineOf(list: RunsList, run: SourcedRun) {
  const { trigger } = run.summary;
  return trigger !== null && "routineId" in trigger
    ? list.source.routine(trigger.routineId)
    : undefined;
}

/** What the run's `run.started` says it ran; `undefined` for a log from before it said. */
function startedVersion(log: readonly RunEvent[] | undefined): RunVersion | undefined {
  const started = log?.find((event) => event.type === "run.started");
  return started?.type === "run.started" ? started.version : undefined;
}

/** What a workflow of the run's workspace is called, by its id; its id when it isn't loaded. */
function workflowName(list: RunsList, run: SourcedRun, workflowId: string): string {
  return list.source.workflow(run.summary.hubId, workflowId)?.name ?? workflowId;
}

/** What the page's words need: the run's workflow, the child runs' workflows, the currency, the time. */
function pageContext(
  list: RunsList,
  runs: readonly SourcedRun[],
  run: SourcedRun,
  now: Date,
): RunPageContext {
  const { source } = list;
  return {
    workflow: source.workflow(run.summary.hubId, run.summary.workflowId),
    workflowOfRun: (runId) => {
      const other = runs.find((candidate) => candidate.summary.id === runId)?.summary;
      if (other === undefined) {
        return undefined;
      }
      return source.workflow(other.hubId, other.workflowId)?.name ?? other.workflowId;
    },
    providerKind: (id: string) => source.providerKind(id),
    ...(source.agentName === undefined
      ? {}
      : { agentName: (id: string) => source.agentName?.(id) }),
    currency: source.currency(),
    now,
  };
}
