import { type SandboxStartCheck, sandboxStartCheckKey } from "@halonicjs/app";
import { SandboxCantRunCallout } from "@halonicjs/studio-feature-runs/api";
import {
  ActionBar,
  Button,
  Callout,
  EmptyState,
  SkeletonBar,
  type Tab,
  TabPanel,
  usePresentation,
  useTabIds,
} from "@halonicjs/studio-kit";
import { ItemGone, type ItemViewProps, type ViewRef } from "@halonicjs/studio-shell";
import { useCallback, useRef, useState } from "react";
import {
  type RoutineRef,
  type RoutinesHost,
  RoutinesHostService,
  type RoutineTarget,
  type RoutineView,
} from "../api.ts";
import { RulesSection } from "../rules/rules-section.tsx";
import { RoutineRunAgentsService } from "../run-agents-api.ts";
import { RunsView } from "../runs/runs-view.tsx";
import { runsWords } from "../runs/runs-words.ts";
import { type RoutineRunsLoad, useRoutineRuns } from "../runs/use-routine-runs.ts";
import { StartsCard } from "../starts/starts-card.tsx";
import { WhenCard } from "../when/when-card.tsx";
import { NotLiveLine } from "./not-live-line.tsx";
import { pageWords } from "./page-words.ts";
import { RoutineHeader, type RoutineViewId } from "./routine-header.tsx";
import { RunAgentsView } from "./run-agents-view.tsx";
import { useRunNowGate } from "./run-now-gate.ts";
import { TRIGGER_STEP } from "./trigger-step.ts";
import { type RoutineLoad, useRoutine } from "./use-routine.ts";
import { useRoutineTrash } from "./use-routine-trash.tsx";
import { useRunNow } from "./use-run-now.tsx";
import { useTriggerFocus } from "./use-trigger-focus.ts";

/** The file tab's item kind and hub part (the Files feature's `FILE_KIND` and `FILE_HUB`): files belong to the workspace folder. */
const fileKind = "file";
const fileHub = "workspace";

/** The routine's page in its tab: `item` names the routine, the host gives its fields. */
export function RoutinePage({ item, context, step, asked }: ItemViewProps) {
  const { openPlace, openItem } = context;
  return (
    <RoutineScreen
      host={context.services.get(RoutinesHostService)}
      hubId={item.hub}
      id={item.id}
      announce={(text) => context.announcer.announce(text)}
      sandboxStartCheck={context.services.find(sandboxStartCheckKey)}
      runAgentsView={context.services.find(RoutineRunAgentsService)}
      {...(step === TRIGGER_STEP && { triggerAsked: asked ?? 0 })}
      {...(openPlace && { goToRoutines: () => openPlace("routines") })}
      {...(openItem && {
        openRun: (runId: string) => openItem({ kind: "run", hub: item.hub, id: runId }),
        openFile: (path: string) => openItem({ kind: fileKind, hub: fileHub, id: path }),
        openTarget: (target: RoutineTarget) =>
          openItem({ kind: target.kind, hub: target.hubId, id: target.id }),
        openAgent: (agentId: string, step?: string) =>
          openItem(
            { kind: "agent", hub: item.hub, id: agentId },
            step === undefined ? {} : { step },
          ),
      })}
    />
  );
}

/** Props for {@link RoutineScreen}. */
export interface RoutineScreenProps {
  readonly host: RoutinesHost;
  readonly hubId: string;
  readonly id: string;
  /** Reads text to screen readers, politely. */
  readonly announce: (text: string) => void;
  /** Opens the Routines list, for a routine that isn't there any more; without it the page can't offer that. */
  readonly goToRoutines?: () => void;
  /** Opens a run's page, for the Run now toast's **Open run**; without it the toast has no such button. */
  readonly openRun?: (runId: string) => void;
  /** Opens the workflow or agent the routine starts, for the phone's "Open <name>" row; without it there is no row. */
  readonly openTarget?: (target: RoutineTarget) => void;
  /** Opens a file in the code editor in a tab; without it the ⋮ menu has no **Open as file**. */
  readonly openFile?: (path: string) => void;
  /**
   * How many times the page was asked for its Trigger picker (`openItem`'s `step`); absent when it
   * wasn't. The picker takes the focus once it is drawn, again each time this changes.
   */
  readonly triggerAsked?: number;
  /**
   * Checks whether the sandbox can start, for a routine whose target runs a program; where it is
   * absent, Run now is never unavailable for the sandbox (the engine still refuses such a run).
   */
  readonly sandboxStartCheck?: SandboxStartCheck | undefined;
  /**
   * The view the Agents feature gives about the agents Run now starts, such as the confirm-again
   * Callout of an agent on hold (`routines.page.confirm-again`); without it there is none.
   */
  readonly runAgentsView?: ViewRef | undefined;
  /** Opens an agent's page, at `step` when given, for that view's **Review and confirm**. */
  readonly openAgent?: (agentId: string, step?: string) => void;
}

/**
 * The routine page's frame (`routines.page.frame-and-states`): the header with the letter avatar,
 * "ROUTINE" and the name, the summary line, the quiet "Changes not live yet" line and the
 * "isn't live yet" notice, then the When card, the Starts card and the Rules. While the file is read a skeleton shows after 300 ms; a routine that
 * can't be read says why, and one that is gone says so with a way back to Routines.
 */
export function RoutineScreen({
  host,
  hubId,
  id,
  announce,
  goToRoutines,
  openRun,
  openTarget,
  openFile,
  triggerAsked,
  sandboxStartCheck,
  runAgentsView,
  openAgent,
}: RoutineScreenProps) {
  // After a Try again reads, the routine's name takes the focus the button had.
  const title = useRef<HTMLHeadingElement>(null);
  const focusTitle = useCallback(() => title.current?.focus(), []);
  const { load, retry, readAgain } = useRoutine(host, { hubId, id }, focusTitle);
  const [view, setView] = useState<RoutineViewId>("schedule");
  // Asked for its Trigger picker, the page shows the Schedule view and the picker takes the focus
  // once the card is drawn, whether the page was just opened or already open.
  const trigger = useTriggerFocus(triggerAsked, () => setView("schedule"));
  const ids = useTabIds();
  const phone = usePresentation() === "phone";
  const routine = load.kind === "ready" ? load.routine : undefined;
  const runs = useRoutineRuns(host, routine);
  const gate = useRunNowGate(host, routine, sandboxStartCheck);
  const runNow = useRunNow(host, routine, gate, openRun, runs.retry);
  const views = routineTabs(runs.load, routine);
  // After Undo brings a deleted routine back, its name takes the focus once the page is drawn again.
  const trash = useRoutineTrash(host, load, focusTitle);
  if (trash.strip !== null) return trash.strip;
  if (load.kind === "failed" && load.gone && goToRoutines !== undefined) {
    return <ItemGone kindName="routine" place="Routines" onGoTo={goToRoutines} />;
  }
  const name = headerName(host, { hubId, id }, load);
  return (
    <div className="flex size-full min-h-0 flex-col">
      <RoutineHeader
        host={host}
        routine={routine}
        name={name}
        tabs={{ ids, views, selected: view, onSelect: setView }}
        title={title}
        onDelete={trash.onDelete}
        openFile={openFile}
        gate={gate}
        runNow={runNow}
      />
      {load.kind === "ready" ? (
        <TabPanel
          ids={ids}
          tabs={views}
          selected={view}
          className={`flex min-h-0 flex-1 flex-col gap-3 overflow-auto py-4 ${phone ? "px-4" : "px-6"}`}
        >
          <SandboxCantRunCallout
            name={name}
            start={gate.sandbox}
            firstLineId={gate.cantRunId}
            announce={announce}
            onReady={() => gate.runNow.current?.focus()}
          />
          {/* Below the can't-run Callout; it never makes Run now unavailable. */}
          {host.runNow !== undefined && (
            <RunAgentsView
              view={runAgentsView}
              hubId={hubId}
              agents={load.routine.programAgents ?? []}
              openAgent={openAgent}
            />
          )}
          {view === "schedule" && (
            <ScheduleView
              host={host}
              routine={load.routine}
              announce={announce}
              openTarget={openTarget}
              focusTrigger={trigger.focusTrigger}
              onTriggerFocused={trigger.done}
              readAgain={readAgain}
              focusTitle={focusTitle}
            />
          )}
          {view === "runs" && (
            <RunsView
              host={host}
              routine={load.routine}
              load={runs.load}
              retry={runs.retry}
              openRun={openRun}
            />
          )}
        </TabPanel>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-6 py-4">
          {load.kind === "failed" && (
            <EmptyState
              tone="error"
              title={pageWords.loadFailedTitle}
              description={load.reason}
              action={{ label: pageWords.tryAgain, onClick: retry, busy: load.retrying }}
            />
          )}
          {load.kind === "loading" && load.skeleton && (
            <div role="status" className="flex flex-col gap-4">
              <span className="sr-only">{pageWords.loading(name)}</span>
              <SkeletonBar kind="value" />
              {load.slow && (
                <p className="flex items-center gap-3 text-small text-fg-muted">
                  {pageWords.stillLoading}
                  <Button variant="secondary" size="sm" onClick={retry}>
                    {pageWords.tryAgain}
                  </Button>
                </p>
              )}
            </div>
          )}
        </div>
      )}
      {phone && routine !== undefined && host.runNow !== undefined && (
        // On a phone Run now is one full-width button at the bottom, on both views (flow-routines 5.2).
        <ActionBar
          whileTyping="hide"
          rows={[
            [
              {
                label: pageWords.runNow,
                ref: gate.runNow,
                busy: runNow.starting,
                unavailable: gate.unavailable,
                onClick: runNow.press,
              },
            ],
          ]}
        />
      )}
      {runNow.dialog}
    </div>
  );
}

/**
 * The name the header shows: the routine's once it is read. When a read fails, the name the host
 * last read from the saved file, as the Routines row shows it, since often only the live version
 * couldn't be read; the id while it loads, or when the host never read the file.
 */
function headerName(host: RoutinesHost, ref: RoutineRef, load: RoutineLoad): string {
  if (load.kind === "ready") return load.routine.name;
  if (load.kind === "failed") return host.nameOf(ref) ?? ref.id;
  return ref.id;
}

/** The Schedule view: the summary and the not-live line, then the When card, the Starts card and the Rules. */
function ScheduleView({
  host,
  routine,
  announce,
  openTarget,
  focusTrigger,
  onTriggerFocused,
  readAgain,
  focusTitle,
}: {
  readonly host: RoutinesHost;
  readonly routine: RoutineView;
  readonly announce: (text: string) => void;
  readonly openTarget: ((target: RoutineTarget) => void) | undefined;
  readonly focusTrigger: boolean;
  readonly onTriggerFocused: () => void;
  /** Reads the routine again, for the not-live line once a version is made. */
  readonly readAgain: () => void;
  /** Gives the routine's name the focus, once the not-live line has gone. */
  readonly focusTitle: () => void;
}) {
  return (
    <>
      <Summary host={host} routine={routine} readAgain={readAgain} focusTitle={focusTitle} />
      <WhenCard
        host={host}
        routine={routine}
        announce={announce}
        focusTrigger={focusTrigger}
        onTriggerFocused={onTriggerFocused}
      />
      <StartsCard host={host} routine={routine} {...(openTarget && { openTarget })} />
      <RulesSection host={host} routine={routine} />
    </>
  );
}

/**
 * The tabs: Schedule, with the error that stops the routine's start (red) while its input lacks a
 * field the engine needs (flow-routines 3.6), and Runs with the number of runs that wait for a
 * person (amber), else a still dot while one runs.
 */
function routineTabs(
  runs: RoutineRunsLoad,
  routine: RoutineView | undefined,
): readonly Tab<RoutineViewId>[] {
  const own = runs.kind === "ready" ? runs.runs.runs : [];
  const waiting = own.filter((run) => run.outcome === "waiting").length;
  const going = own.some((run) => run.outcome === "running");
  const errors = routine?.inputMissing !== undefined ? 1 : 0;
  return [
    {
      id: "schedule",
      label: runsWords.scheduleTab,
      ...(errors > 0 && {
        count: { value: errors, tone: "danger" as const, name: runsWords.scheduleErrors(errors) },
      }),
    },
    {
      id: "runs",
      label: runsWords.tab,
      ...(waiting > 0 && {
        count: { value: waiting, tone: "warning" as const, name: runsWords.tabNeedsYou(waiting) },
      }),
      ...(waiting === 0 && going && { running: { name: runsWords.tabRunning } }),
    },
  ];
}

/**
 * What sits under the header once the routine is read: its one-line summary (muted, with "Off · "
 * in front, when it is off), then at most one note about what is live. A routine that is on but
 * has never been live has the notice and nothing else, since "Changes not live yet" would be a
 * second reason for the same thing. The "Changes not live yet" line can make the routine live.
 */
function Summary({
  host,
  routine,
  readAgain,
  focusTitle,
}: {
  readonly host: RoutinesHost;
  readonly routine: RoutineView;
  readonly readAgain: () => void;
  readonly focusTitle: () => void;
}) {
  const neverLive = routine.enabled && !routine.everLive;
  return (
    <>
      <p className={routine.enabled ? "text-body" : "text-body text-fg-muted"}>
        {routine.enabled ? routine.summary : `${pageWords.off} · ${routine.summary}`}
      </p>
      {neverLive && <Callout tone="info">{pageWords.neverLive}</Callout>}
      {!neverLive && (
        <NotLiveLine host={host} routine={routine} readAgain={readAgain} onMadeLive={focusTitle} />
      )}
    </>
  );
}
