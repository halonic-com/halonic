import { InboxService } from "@halonicjs/studio-feature-inbox/api";
import {
  openModelsOf,
  RunsListService,
  type RunsSource,
  RunsSourceService,
} from "@halonicjs/studio-feature-runs/api";
import {
  Button,
  CloseIcon,
  CommandBox,
  EmptyState,
  LetterTile,
  SkeletonBar,
  TabList,
  TabPanel,
  usePresentation,
  useTabIds,
} from "@halonicjs/studio-kit";
import { engineWordsOf, ItemGone, type ItemViewProps } from "@halonicjs/studio-shell";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { type WorkflowsHost, WorkflowsHostService } from "../api.ts";
import type { View } from "../canvas/geometry.ts";
import { Configuration } from "../configuration/configuration-page.tsx";
import { configurationWords } from "../configuration/configuration-words.ts";
import { countProblems } from "../configuration/problem-lines.ts";
import { runCount } from "../runs/runs-model.ts";
import { RunsView } from "../runs/runs-view.tsx";
import { useRuns } from "../runs/use-runs.ts";
import { useSaveAsTest } from "../runs/use-save-as-test.ts";
import { useAnnounceDockedRun } from "../start/run-announcement.ts";
import type { ShownRun } from "../start/run-strip.ts";
import { startWords } from "../start/start-words.ts";
import { TestsPage } from "../tests/tests-page.tsx";
import { pageWords } from "./page-words.ts";
import { dockHasCard, RunDock, useDock, useShownRun } from "./run-dock.tsx";
import { useAskedForTests } from "./use-asked-for-tests.ts";
import { useCanvasEdit } from "./use-canvas-edit.ts";
import { useRename } from "./use-rename.ts";
import { useHostRead, useWorkflow } from "./use-workflow.ts";
import { type CanvasEdit, WorkflowCanvas } from "./workflow-canvas.tsx";
import { WorkflowName } from "./workflow-name.tsx";
import type { WorkflowScreenProps } from "./workflow-screen-props.ts";
import { type WorkflowView, workflowTabs } from "./workflow-tabs.ts";

/** The command that opens the workspace page at its Budget block (`features/workspace`). */
const openBudgetCommand = "workspace.open-budget";

/** The tab a page opens on: Configuration when asked for its Tests, else Flow. */
function firstView(startOnTests: boolean | undefined): WorkflowView {
  return startOnTests ? "configuration" : "flow";
}

/** What Configuration starts with: Tests with no test picked when asked for them, else General. */
function firstTestsPick(startOnTests: boolean | undefined) {
  return startOnTests ? { name: undefined, n: 0 } : undefined;
}

/** The workflow's page in its tab: `item` names the workflow, the host gives its steps. */
export function WorkflowPage({ item, context, step, asked }: ItemViewProps) {
  const { openItem, openPlace } = context;
  const runsList = context.services.get(RunsListService);
  const openModels = openModelsOf(context);
  return (
    <WorkflowScreen
      host={context.services.get(WorkflowsHostService)}
      runs={context.services.get(RunsSourceService)}
      hubId={item.hub}
      id={item.id}
      {...(step === "tests" && { startOnTests: true, testsAsked: asked ?? 0 })}
      notAnswering={engineWordsOf(context).notAnswering}
      announceState={(key, text) => context.announcer.announceState(key, text)}
      announce={(line) => context.announcer.announce(line)}
      {...(openModels && { openModels })}
      {...(context.runCommand && {
        openBudget: () => void context.runCommand?.(openBudgetCommand),
      })}
      shownRuns={context.services.find(InboxService)?.shownRuns}
      {...(openItem && {
        openRun: (runId: string, step?: string) =>
          openItem({ kind: "run", hub: item.hub, id: runId }, step === undefined ? {} : { step }),
      })}
      {...(openPlace && {
        goToWorkflows: () => openPlace("workflows"),
        reviewInInbox: (runId: string) => {
          runsList.reviewInInbox(runId);
          openPlace("inbox");
        },
        seeAllRuns: () => {
          runsList.showWorkflow({ hubId: item.hub, id: item.id });
          openPlace("runs");
        },
      })}
    />
  );
}

/**
 * The workflow page's frame (`workflows.page`): full width, with no ⤢, no ✕ and no chat column
 * until the Assistant lands. The header has the letter avatar, "WORKFLOW" and the name; under it
 * is the canvas, a skeleton when the file takes over 300 ms, or why it couldn't be read.
 */
export function WorkflowScreen({
  host,
  runs,
  hubId,
  id,
  notAnswering = engineWordsOf({}).notAnswering,
  openRun,
  openModels,
  openBudget,
  seeAllRuns,
  goToWorkflows,
  reviewInInbox,
  shownRuns,
  startOnTests,
  testsAsked = 0,
  announceState,
  announce,
}: WorkflowScreenProps) {
  // After a Try again reads, the workflow's name takes the focus the button had.
  const title = useRef<HTMLHeadingElement>(null);
  const focusTitle = useCallback(() => title.current?.focus(), []);
  const { load, retry } = useWorkflow(host, { hubId, id }, focusTitle);
  const name = load.kind === "ready" ? load.value.name : id;
  const settings = useHostRead(
    host,
    { hubId, id },
    (one, ref) => one.configuration(ref),
    focusTitle,
  );
  const everyWorkflow = useHostRead(host, { hubId, id }, (one) => one.list(), focusTitle);
  const runsRead = useRuns(runs, focusTitle);
  const [view, setView] = useState<WorkflowView>(firstView(startOnTests));
  // The canvas unmounts on Configuration, so the page keeps its zoom and pan (D9). They belong to
  // one workflow: the same screen can be handed another, which opens fitted.
  const [kept, setKept] = useState<{ readonly of: string; readonly view: View } | undefined>();
  const workflowKey = `${hubId}/${id}`;
  const keep = useCallback((next: View) => setKept({ of: workflowKey, view: next }), [workflowKey]);
  const [openStep, setOpenStep] = useState<string | undefined>();
  const { dock, setDock, closeDock, runButton, rowCard, setRowCard } = useDock(title);
  const [shownId, setShownId] = useState<string | undefined>();
  const showView = (next: WorkflowView) => {
    // The row's card goes with the Runs view, as it did when the view kept it.
    if (next !== view) setRowCard(undefined);
    setView(next);
  };
  // The step picked on the canvas, which says what happened to it while a run is shown (4.5).
  const [pickedStep, setPickedStep] = useState<string | undefined>();
  // The test just made from a run: Configuration opens on Tests with it picked. A page opened on
  // its Tests (`startOnTests`) starts the same way, with no test picked.
  // `n` counts the tests made, so each one remounts Configuration and the Tests page reads again.
  const [madeTest, setMadeTest] = useState<
    { readonly name: string | undefined; readonly n: number } | undefined
  >(firstTestsPick(startOnTests));
  const testsMade = useRef(0);
  // A page that is already open and is asked for its Tests (`startOnTests` turns true, or
  // `testsAsked` counts up while it is true) goes to Configuration on Tests, as if it had opened
  // there. It is counted like a made test, so Configuration remounts even if it is already open.
  useAskedForTests(startOnTests, testsAsked, () => {
    showView("configuration");
    testsMade.current += 1;
    setMadeTest({ name: undefined, n: testsMade.current });
  });
  const ids = useTabIds();
  const phone = usePresentation() === "phone";
  // A step picked on the canvas is the dock's business only while the canvas shows.
  const dockStep = view === "flow" ? pickedStep : undefined;
  const errors =
    settings.load.kind === "ready" ? countProblems(settings.load.value.problems).errors : 0;
  // `halonic run reply` stops when two hubs have a `reply`, so the command then names the hub.
  const inSeveralHubs =
    everyWorkflow.load.kind === "ready" &&
    everyWorkflow.load.value.some((one) => one.id === id && one.hubId !== hubId);
  const startCommand = inSeveralHubs ? `halonic run ${hubId}/${id}` : `halonic run ${id}`;
  const needYou = runCount(runsRead.load, { hubId, id }, runs);
  const views = workflowTabs(errors, needYou);
  const shown = useShownRun(runsRead.load, { hubId, id }, runs, shownId);
  const strip = shown?.line;
  useAnnounceDockedRun(strip, typeof dock === "object", announceState);
  const { startRun } = host;
  const saveAsTest = useSaveAsTest(host, { hubId, id }, (testName) => {
    testsMade.current += 1;
    setMadeTest({ name: testName, n: testsMade.current });
    setDock(undefined);
    showView("configuration");
  });
  const canvasEdit = useCanvasEdit(host, { hubId, id }, name, phone);
  const rename = useRename(host, { hubId, id }, name, everyWorkflow.load, announce);
  const gone = goneState(load, goToWorkflows);
  if (gone !== undefined) return gone;
  return (
    <div className="flex size-full min-h-0 flex-col">
      <header
        className={
          phone
            ? "flex flex-col gap-3 border-b border-border px-4 py-3"
            : "flex items-center gap-3 border-b border-border px-6 py-3"
        }
      >
        {/* On a phone the top bar already names the workflow, so the page keeps only its type. */}
        <div className="flex items-center gap-3">
          <LetterTile name={name} />
          <div className="flex flex-col">
            <p className="text-caption text-fg-muted">{pageWords.kind}</p>
            <h1 ref={title} tabIndex={-1} className={phone ? "sr-only" : "text-title"}>
              <WorkflowName
                name={name}
                rename={rename}
                ready={load.kind === "ready"}
                phone={phone}
              />
            </h1>
          </div>
        </div>
        <TabList
          label={configurationWords.tabs}
          tabs={views}
          selected={view}
          onSelect={(next) => {
            // A direct tab click must not re-pick the card a problem link opened.
            setOpenStep(undefined);
            // The test just made was shown once; coming back opens Configuration on General.
            if (next !== view) setMadeTest(undefined);
            showView(next);
          }}
          ids={ids}
        />
        {startRun && (
          <div className="ms-auto">
            <Button
              ref={runButton}
              variant="primary"
              size="sm"
              onClick={() => {
                setRowCard(undefined);
                setDock("start");
              }}
            >
              {startWords.run}
            </Button>
          </div>
        )}
      </header>
      {/* With a Run button, the page starts it itself, so the terminal line would only repeat it. */}
      {!startRun && settings.load.kind === "ready" && errors === 0 && (
        <div
          data-testid="start-command"
          className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-6 py-2 text-small text-fg-muted"
        >
          <p>{pageWords.startIt}</p>
          <CommandBox command={startCommand} />
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <TabPanel
          ids={ids}
          tabs={views}
          selected={view}
          className={panelClass(view, {
            phone,
            docked: dockHasCard({ dock, host, shown, pickedStep: dockStep }),
          })}
        >
          {view === "configuration" && (
            <Configuration
              key={madeTest?.n ?? 0}
              name={name}
              load={settings.load}
              retry={settings.retry}
              tests={
                <TestsPage
                  host={host}
                  workflow={{ hubId, id }}
                  name={name}
                  openRun={openRun}
                  pickName={madeTest?.name}
                  notAnswering={notAnswering}
                />
              }
              startOn={madeTest === undefined ? undefined : "tests"}
              onOpenStep={(stepId) => {
                setOpenStep(stepId);
                setMadeTest(undefined);
                showView("flow");
              }}
            />
          )}
          {view === "runs" && (
            <RunsView
              source={runs}
              load={runsRead.load}
              retry={runsRead.retry}
              workflow={{ hubId, id }}
              picked={rowCard}
              onPick={(runId) => {
                setRowCard(runId);
                if (runId !== undefined) setDock(undefined);
              }}
              openRun={openRun}
              reviewInInbox={reviewInInbox}
              seeAll={seeAllRuns}
              saveAsTest={saveAsTest}
            />
          )}
          {view === "flow" && (
            <FlowView
              load={load}
              retry={retry}
              hubId={hubId}
              id={id}
              name={name}
              openStep={openStep}
              strip={strip}
              onClearStrip={() => {
                setShownId(undefined);
                setPickedStep(undefined);
                // A run dock goes with the strip, or it would wait for a run that is already listed.
                setDock((now) => (typeof now === "object" ? undefined : now));
              }}
              onSelectStep={setPickedStep}
              edit={canvasEdit}
              kept={kept}
              onView={keep}
            />
          )}
        </TabPanel>
        <RunDock
          dock={dock}
          host={host}
          workflow={{ hubId, id }}
          workflowName={name}
          notAnswering={notAnswering}
          shown={shown}
          shownRuns={shownRuns}
          onDock={setDock}
          onClose={closeDock}
          onStarted={(runId) => {
            setShownId(runId);
            // A step picked before the run isn't about this run: its card would hide the run's.
            setPickedStep(undefined);
          }}
          openRun={openRun}
          openModels={openModels}
          openBudget={openBudget}
          announce={announce}
          saveAsTest={saveAsTest}
          pickedStep={dockStep}
          onClosePickedStep={() => setPickedStep(undefined)}
        />
      </div>
    </div>
  );
}

/**
 * The tab panel's layout: Flow fills it with the canvas, Runs with its list and a run's card side by
 * side (each scrolls and keeps its own inset), and Configuration scrolls. On a phone a docked card
 * takes the page's body, so the panel hides behind it: beside the card it would have no room.
 */
function panelClass(
  view: WorkflowView,
  { phone, docked }: { readonly phone: boolean; readonly docked: boolean },
): string {
  if (phone && docked) return "hidden";
  switch (view) {
    case "flow":
      return "flex min-h-0 min-w-0 flex-1 flex-col";
    case "runs":
      return "flex min-h-0 min-w-0 flex-1";
    case "configuration":
      return "min-w-0 flex-1 overflow-auto";
  }
}

/**
 * A workflow deleted or renamed outside, or a link to one that never was: the item-gone state
 * instead of an error, since Try again can't bring it back (microcopy 2 "Item gone").
 */
function goneState(
  load: ReturnType<typeof useWorkflow>["load"],
  goToWorkflows: (() => void) | undefined,
): ReactNode {
  if (load.kind !== "failed" || load.gone !== true || goToWorkflows === undefined) return undefined;
  return <ItemGone kindName="workflow" place="Workflows" onGoTo={goToWorkflows} />;
}

interface FlowViewProps {
  readonly load: ReturnType<typeof useWorkflow>["load"];
  readonly retry: () => void;
  readonly hubId: string;
  readonly id: string;
  readonly name: string;
  readonly openStep: string | undefined;
  /** The shown run's strip and the step it failed in (D8); absent when no run is shown. */
  readonly strip: ShownRun | undefined;
  readonly onClearStrip: () => void;
  readonly onSelectStep: (stepId: string) => void;
  /** How the canvas's toolbar changes the workflow; absent where it can't. */
  readonly edit: CanvasEdit | undefined;
  readonly kept: { readonly of: string; readonly view: View } | undefined;
  readonly onView: (next: View) => void;
}

/** The Flow tab's content: the canvas, a skeleton when the file is slow, or why it couldn't be read. */
function FlowView({
  load,
  retry,
  hubId,
  id,
  name,
  openStep,
  strip,
  onClearStrip,
  onSelectStep,
  edit,
  kept,
  onView,
}: FlowViewProps) {
  const workflowKey = `${hubId}/${id}`;
  return (
    <>
      {strip && (
        <p className="flex items-center justify-between gap-3 border-b border-border px-6 py-2 text-small">
          {strip.line}
          <Button
            variant="ghost"
            size="sm"
            icon={<CloseIcon />}
            label={startWords.clearStrip}
            onClick={onClearStrip}
          />
        </p>
      )}
      {load.kind === "ready" && load.value.id === id && load.value.hubId === hubId && (
        <WorkflowCanvas
          key={`${workflowKey}/${openStep}`}
          workflow={load.value}
          selectedStep={openStep}
          failedStep={strip?.failedStep}
          route={strip?.route}
          marks={strip?.marks}
          active={strip?.active}
          saved={kept?.of === workflowKey ? kept.view : undefined}
          onView={onView}
          onSelectStep={onSelectStep}
          edit={edit}
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
        <div role="status" className="flex flex-1 flex-col gap-4 p-6">
          <span className="sr-only">{pageWords.loading(name)}</span>
          <div className="flex gap-6">
            <SkeletonBar kind="value" />
            <SkeletonBar kind="value" />
          </div>
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
    </>
  );
}
