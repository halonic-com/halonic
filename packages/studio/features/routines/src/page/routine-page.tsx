import {
  Button,
  Callout,
  EmptyState,
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
import { ItemGone, type ItemViewProps, NameField } from "@halonicjs/studio-shell";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { type RoutinesHost, RoutinesHostService, type RoutineView } from "../api.ts";
import { Avatar } from "../list/routine-rows.tsx";
import { trashRoutine } from "../list/trash-routine.ts";
import { RulesSection } from "../rules/rules-section.tsx";
import { RunsView } from "../runs/runs-view.tsx";
import { runsWords } from "../runs/runs-words.ts";
import { type RoutineRunsLoad, useRoutineRuns } from "../runs/use-routine-runs.ts";
import { StartsCard } from "../starts/starts-card.tsx";
import { WhenCard } from "../when/when-card.tsx";
import { failureReason, pageWords } from "./page-words.ts";
import { runRoutineNow } from "./run-now.ts";
import { useRoutine } from "./use-routine.ts";

/** The routine's page in its tab: `item` names the routine, the host gives its fields. */
export function RoutinePage({ item, context }: ItemViewProps) {
  const { openPlace, openItem } = context;
  return (
    <RoutineScreen
      host={context.services.get(RoutinesHostService)}
      hubId={item.hub}
      id={item.id}
      announce={(text) => context.announcer.announce(text)}
      {...(openPlace && { goToRoutines: () => openPlace("routines") })}
      {...(openItem && {
        openRun: (runId: string) => openItem({ kind: "run", hub: item.hub, id: runId }),
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
}: RoutineScreenProps) {
  // After a Try again reads, the routine's name takes the focus the button had.
  const title = useRef<HTMLHeadingElement>(null);
  const focusTitle = useCallback(() => title.current?.focus(), []);
  const { load, retry } = useRoutine(host, { hubId, id }, focusTitle);
  const [view, setView] = useState<RoutineViewId>("schedule");
  const ids = useTabIds();
  const routine = load.kind === "ready" ? load.routine : undefined;
  const runs = useRoutineRuns(host, routine);
  const views = routineTabs(runs.load);
  // After Undo brings a deleted routine back, its name takes the focus once the page is drawn again.
  const focusWhenBack = useRef(false);
  const ready = load.kind === "ready";
  useEffect(() => {
    if (!ready || !focusWhenBack.current) return;
    focusWhenBack.current = false;
    focusTitle();
  }, [ready, focusTitle]);
  const restored = useCallback(() => {
    focusWhenBack.current = true;
  }, []);
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
        onRestored={restored}
        openRun={openRun}
      />
      <TabPanel
        ids={ids}
        tabs={views}
        selected={view}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-6 py-4"
      >
        {load.kind === "ready" && view === "schedule" && <Summary routine={load.routine} />}
        {load.kind === "ready" && view === "schedule" && (
          <WhenCard host={host} routine={load.routine} announce={announce} />
        )}
        {load.kind === "ready" && view === "schedule" && (
          <StartsCard host={host} routine={load.routine} />
        )}
        {load.kind === "ready" && view === "schedule" && (
          <RulesSection host={host} routine={load.routine} />
        )}
        {load.kind === "ready" && view === "runs" && (
          <RunsView
            host={host}
            routine={load.routine}
            load={runs.load}
            retry={runs.retry}
            openRun={openRun}
          />
        )}
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
      </TabPanel>
    </div>
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
 * is read, then its ⋮ menu with Delete and **Run now** at the right (only where the host can start a run). On a phone the top bar already names the routine, so the
 * page keeps only its type.
 */
function RoutineHeader({
  host,
  routine,
  name,
  title,
  tabs,
  onRestored,
  openRun,
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
  /** Called once Undo has put a deleted routine back. */
  readonly onRestored: () => void;
  readonly openRun: ((runId: string) => void) | undefined;
}) {
  const phone = usePresentation() === "phone";
  const toasts = useToastStore();
  // A second press while the host still starts the first run would start a second run.
  const [starting, setStarting] = useState(false);
  const start = () => {
    if (routine === undefined || starting) return;
    setStarting(true);
    void runRoutineNow(host, toasts, routine, openRun).finally(() => setStarting(false));
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
        <Avatar name={name} />
        <div className="flex min-w-0 flex-col">
          <p className="text-caption text-fg-muted">{pageWords.kind}</p>
          <h1 ref={title} tabIndex={-1} className={phone ? "sr-only" : "text-title outline-none"}>
            {heading}
          </h1>
        </div>
        {routine !== undefined && (
          <Menu
            entries={[
              {
                id: "delete",
                label: pageWords.delete,
                danger: true,
                onSelect: () => void trashRoutine(host, toasts, routine, { onRestored }),
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
          <Button variant="secondary" size="sm" busy={starting} onClick={start}>
            {pageWords.runNow}
          </Button>
        </div>
      )}
    </header>
  );
}
