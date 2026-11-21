import { type SandboxStartCheck, sandboxStartCheckKey } from "@halonicjs/app";
import { SandboxCantRunCallout } from "@halonicjs/studio-feature-runs/api";
import {
  Button,
  Callout,
  EmptyState,
  LetterTile,
  Menu,
  MoreIcon,
  SkeletonBar,
  type Tab,
  type TabIds,
  TabList,
  TabPanel,
  usePresentation,
  useTabIds,
  useToastStore,
} from "@halonicjs/studio-kit";
import { ItemGone, type ItemViewProps, NameField, RenameSheet } from "@halonicjs/studio-shell";
import { type RefObject, useCallback, useRef, useState } from "react";
import { type RoutinesHost, RoutinesHostService, type RoutineView } from "../api.ts";
import { RulesSection } from "../rules/rules-section.tsx";
import { RunsView } from "../runs/runs-view.tsx";
import { runsWords } from "../runs/runs-words.ts";
import { type RoutineRunsLoad, useRoutineRuns } from "../runs/use-routine-runs.ts";
import { StartsCard } from "../starts/starts-card.tsx";
import { WhenCard } from "../when/when-card.tsx";
import { failureReason, pageWords } from "./page-words.ts";
import { RunDialog, runDialogReason } from "./run-dialog.tsx";
import { runRoutineNow } from "./run-now.ts";
import { type RunNowGate, useRunNowGate } from "./run-now-gate.ts";
import { TRIGGER_STEP } from "./trigger-step.ts";
import { useRoutine } from "./use-routine.ts";
import { useRoutineTrash } from "./use-routine-trash.tsx";
import { useTriggerFocus } from "./use-trigger-focus.ts";

/** The file tab's item kind and hub part (the Files feature's `FILE_KIND` and `FILE_HUB`): files belong to the workspace folder. */
const fileKind = "file";
const fileHub = "workspace";

/** The routine's page in its tab: `item` names the routine, the host gives its fields. */
export function RoutinePage({ item, context, step, asked }: ItemViewProps) {
  const { openPlace, openItem, runCommand } = context;
  return (
    <RoutineScreen
      host={context.services.get(RoutinesHostService)}
      hubId={item.hub}
      id={item.id}
      announce={(text) => context.announcer.announce(text)}
      sandboxStartCheck={context.services.find(sandboxStartCheckKey)}
      {...(step === TRIGGER_STEP && { triggerAsked: asked ?? 0 })}
      {...(openPlace && { goToRoutines: () => openPlace("routines") })}
      {...(runCommand && { addConnector: () => void runCommand("library.new-connector") })}
      {...(openItem && {
        openRun: (runId: string) => openItem({ kind: "run", hub: item.hub, id: runId }),
        openFile: (path: string) => openItem({ kind: fileKind, hub: fileHub, id: path }),
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
  /** Opens New connector, for the When card's **Add a Google connector**; without it the card has no such link. */
  readonly addConnector?: () => void;
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
  addConnector,
  openFile,
  triggerAsked,
  sandboxStartCheck,
}: RoutineScreenProps) {
  // After a Try again reads, the routine's name takes the focus the button had.
  const title = useRef<HTMLHeadingElement>(null);
  const focusTitle = useCallback(() => title.current?.focus(), []);
  const { load, retry } = useRoutine(host, { hubId, id }, focusTitle);
  const [view, setView] = useState<RoutineViewId>("schedule");
  // Asked for its Trigger picker, the page shows the Schedule view and the picker takes the focus
  // once the card is drawn, whether the page was just opened or already open.
  const trigger = useTriggerFocus(triggerAsked, () => setView("schedule"));
  const ids = useTabIds();
  const phone = usePresentation() === "phone";
  const routine = load.kind === "ready" ? load.routine : undefined;
  const runs = useRoutineRuns(host, routine);
  const gate = useRunNowGate(host, routine, sandboxStartCheck);
  const views = routineTabs(runs.load);
  // After Undo brings a deleted routine back, its name takes the focus once the page is drawn again.
  const trash = useRoutineTrash(host, load, focusTitle);
  if (trash.strip !== null) return trash.strip;
  if (load.kind === "failed" && load.gone && goToRoutines !== undefined) {
    return <ItemGone kindName="routine" place="Routines" onGoTo={goToRoutines} />;
  }
  const name = load.kind === "ready" ? load.routine.name : id;
  return (
    <div className="flex size-full min-h-0 flex-col">
      <RoutineHeader
        host={host}
        routine={routine}
        name={name}
        tabs={{ ids, views, selected: view, onSelect: setView }}
        title={title}
        onDelete={trash.onDelete}
        openRun={openRun}
        openFile={openFile}
        gate={gate}
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
          {view === "schedule" && (
            <ScheduleView
              host={host}
              routine={load.routine}
              announce={announce}
              addConnector={addConnector}
              focusTrigger={trigger.focusTrigger}
              onTriggerFocused={trigger.done}
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
    </div>
  );
}

/** The Schedule view: the summary, then the When card, the Starts card and the Rules. */
function ScheduleView({
  host,
  routine,
  announce,
  addConnector,
  focusTrigger,
  onTriggerFocused,
}: {
  readonly host: RoutinesHost;
  readonly routine: RoutineView;
  readonly announce: (text: string) => void;
  readonly addConnector: (() => void) | undefined;
  readonly focusTrigger: boolean;
  readonly onTriggerFocused: () => void;
}) {
  return (
    <>
      <Summary routine={routine} />
      <WhenCard
        host={host}
        routine={routine}
        announce={announce}
        {...(addConnector && { addConnector })}
        focusTrigger={focusTrigger}
        onTriggerFocused={onTriggerFocused}
      />
      <StartsCard host={host} routine={routine} />
      <RulesSection host={host} routine={routine} />
    </>
  );
}

/** The page's two views. */
type RoutineViewId = "schedule" | "runs";

/**
 * The tabs: Schedule, and Runs with the number of runs that wait for a person (amber), else a
 * still dot while one runs.
 */
function routineTabs(runs: RoutineRunsLoad): readonly Tab<RoutineViewId>[] {
  const own = runs.kind === "ready" ? runs.runs.runs : [];
  const waiting = own.filter((run) => run.outcome === "waiting").length;
  const going = own.some((run) => run.outcome === "running");
  return [
    { id: "schedule", label: runsWords.scheduleTab },
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
 * second reason for the same thing.
 */
function Summary({ routine }: { readonly routine: RoutineView }) {
  const neverLive = routine.enabled && !routine.everLive;
  return (
    <>
      <p className={routine.enabled ? "text-body" : "text-body text-fg-muted"}>
        {routine.enabled ? routine.summary : `${pageWords.off} · ${routine.summary}`}
      </p>
      {neverLive && <Callout tone="info">{pageWords.neverLive}</Callout>}
      {!neverLive && routine.changesNotLive && (
        <p className="text-small text-fg-muted">{pageWords.changesNotLive}</p>
      )}
    </>
  );
}

/**
 * The page's header: the avatar, "ROUTINE" and the name, which is a rename field once the routine
 * is read, then its ⋮ menu with Open as file (where tabs open) and Delete, and **Run now** at the right (only where the host can start a run). On a phone the top bar already names the routine, so the
 * page keeps only its type.
 */
function RoutineHeader({
  host,
  routine,
  name,
  title,
  tabs,
  onDelete,
  openRun,
  openFile,
  gate,
}: {
  readonly host: RoutinesHost;
  /** The routine, once it is read; before that the header shows the id and has no menu. */
  readonly routine: RoutineView | undefined;
  readonly name: string;
  readonly title: RefObject<HTMLHeadingElement | null>;
  /** The page's views, shown as tabs once the routine is read. */
  readonly tabs: {
    readonly ids: TabIds;
    readonly views: readonly Tab<RoutineViewId>[];
    readonly selected: RoutineViewId;
    readonly onSelect: (view: RoutineViewId) => void;
  };
  /** Deletes the routine, for the ⋮ menu's Delete. */
  readonly onDelete: (routine: RoutineView) => void;
  readonly openRun: ((runId: string) => void) | undefined;
  readonly openFile: ((path: string) => void) | undefined;
  /** Whether Run now can start a run while the sandbox can't start, and its button. */
  readonly gate: RunNowGate;
}) {
  const phone = usePresentation() === "phone";
  const toasts = useToastStore();
  const [renaming, setRenaming] = useState(false);
  // A second press while the host still starts the first run would start a second run.
  const [starting, setStarting] = useState(false);
  // Run now on a routine that isn't fully live asks first, in the run dialog.
  const [asking, setAsking] = useState(false);
  const start = () => {
    if (routine === undefined || starting || gate.unavailable !== undefined) return;
    setAsking(false);
    setStarting(true);
    void runRoutineNow(host, toasts, routine, openRun).finally(() => setStarting(false));
  };
  const pressRunNow = () => {
    if (routine === undefined || starting) return;
    if (runDialogReason(host, routine) === undefined) start();
    else setAsking(true);
  };
  const rename = ({ hubId, id }: RoutineView, next: string) => {
    host.save({ hubId, id }, { name: next }).catch((error: unknown) => {
      toasts?.show({
        tone: "danger",
        title: pageWords.couldntRename(name, undefined),
        text: failureReason(error),
      });
    });
  };
  const heading =
    routine !== undefined && !phone ? (
      <NameField
        name={name}
        label={pageWords.nameLabel}
        onRename={(next) => rename(routine, next)}
      />
    ) : (
      name
    );
  return (
    <header
      className={
        phone
          ? "flex flex-col gap-3 border-b border-border px-4 py-3"
          : "flex items-center gap-3 border-b border-border px-6 py-3"
      }
    >
      <div className="flex min-w-0 items-center gap-3">
        <LetterTile name={name} />
        <div className="flex min-w-0 flex-col">
          <p className="text-caption text-fg-muted">{pageWords.kind}</p>
          <h1 ref={title} tabIndex={-1} className={phone ? "sr-only" : "text-title"}>
            {heading}
          </h1>
        </div>
        {routine !== undefined && (
          <Menu
            entries={[
              // The phone has no name field in the header, so renaming is a sheet from ⋮.
              ...(phone
                ? [{ id: "rename", label: pageWords.rename, onSelect: () => setRenaming(true) }]
                : []),
              ...(openFile === undefined || phone
                ? []
                : [
                    {
                      id: "open-as-file",
                      label: pageWords.openAsFile,
                      onSelect: () => openFile(routine.file),
                    },
                  ]),
              {
                id: "delete",
                label: pageWords.delete,
                danger: true,
                onSelect: () => onDelete(routine),
              },
            ]}
            trigger={(trigger) => (
              <Button
                {...trigger}
                variant="ghost"
                size="sm"
                icon={<MoreIcon />}
                label={pageWords.more(name)}
              />
            )}
          />
        )}
      </div>
      {routine !== undefined && (
        <TabList
          label={runsWords.viewsLabel}
          tabs={tabs.views}
          selected={tabs.selected}
          onSelect={tabs.onSelect}
          ids={tabs.ids}
        />
      )}
      {routine !== undefined && host.runNow !== undefined && (
        <div className="ml-auto">
          <Button
            ref={gate.runNow}
            variant="secondary"
            size="sm"
            busy={starting}
            unavailable={gate.unavailable}
            onClick={pressRunNow}
          >
            {pageWords.runNow}
          </Button>
        </div>
      )}
      {routine !== undefined && renaming && (
        <RenameSheet
          kindName="routine"
          name={name}
          onRename={(next) => rename(routine, next)}
          onClose={() => setRenaming(false)}
        />
      )}
      {asking && routine !== undefined && (
        <RunDialog host={host} routine={routine} onRun={start} onCancel={() => setAsking(false)} />
      )}
    </header>
  );
}
