import { startRunCommand } from "@halonicjs/app";
import { Button, usePresentation } from "@halonicjs/studio-kit";
import { engineWordsOf, type ItemPageHandle, useFilesWithErrors } from "@halonicjs/studio-shell";
import { useCallback, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { View } from "../canvas/geometry.ts";
import { Configuration } from "../configuration/configuration-page.tsx";
import { countProblems } from "../configuration/problem-lines.ts";
import { useWorkflowReview, WorkflowReviewContext } from "../review/workflow-review.tsx";
import { runCount } from "../runs/runs-model.ts";
import { RunsView } from "../runs/runs-view.tsx";
import { useRuns } from "../runs/use-runs.ts";
import { useSaveAsTest } from "../runs/use-save-as-test.ts";
import { useAnnounceDockedRun } from "../start/run-announcement.ts";
import { startWords } from "../start/start-words.ts";
import { TestsPage } from "../tests/tests-page.tsx";
import { blockingFileOf } from "./blocking-file.ts";
import { StepEditDock } from "./docked-step-card.tsx";
import { FlowView } from "./flow-view.tsx";
import { insteadOfPage } from "./gone-state.tsx";
import { GuideSlot } from "./guide-card.tsx";
import { pageOrGuideScreen, useGuideRun, useGuideScreen } from "./guide-screen.tsx";
import { firstTestsPick, firstView, hasDockedCard, panelClass, stepNamesOf } from "./page-view.ts";
import { type DockOpener, drawingCaption, RunDock, useDock, useShownRun } from "./run-dock.tsx";
import { unavailableFor, useRunGate } from "./run-gate.ts";
import { missingAliasOf, useProblemsGate, useStartRefusal } from "./start-row.tsx";
import { stepCardIn } from "./step-card.tsx";
import { useAskedForRunForm } from "./use-asked-for-run-form.ts";
import { useAskedForTests } from "./use-asked-for-tests.ts";
import { useCanvasEdit } from "./use-canvas-edit.ts";
import { useOpenProblems } from "./use-open-problems.ts";
import { useOutline } from "./use-outline.ts";
import { useRename } from "./use-rename.ts";
import { useHostRead, useWorkflow } from "./use-workflow.ts";
import { useWorkflowTrash } from "./use-workflow-trash.tsx";
import { WorkflowBands } from "./workflow-bands.tsx";
import type { CanvasFocus } from "./workflow-canvas.tsx";
import { WorkflowFrame } from "./workflow-frame.tsx";
import type { WorkflowScreenProps } from "./workflow-screen-props.ts";
import { type WorkflowView, workflowTabs } from "./workflow-tabs.ts";

/**
 * The workflow page (`workflows.page.frame-and-states`): the shell's item page, with the
 * Assistant's chat on the left when it gives one, else full width. The header has the workflow's
 * name, its ⋮, its views and ▶ Run; under it is the canvas, a skeleton when the file takes over
 * 300 ms, or why it couldn't be read.
 */
export function WorkflowScreen({
  host: readHost,
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
  runFormAsked,
  outline,
  outlineAsked = 0,
  announceState,
  announce,
  saving,
  sandboxStartCheck,
  openAgent,
  agents,
  reviewAndConfirm,
  openFileAt,
  filesWithErrors,
  guide,
  showInChat,
  review,
  chatFor,
  closeStack,
}: WorkflowScreenProps) {
  // After a Try again reads, the workflow's name takes the focus the button had.
  const title = useRef<HTMLHeadingElement>(null);
  const focusTitle = useCallback(() => title.current?.focus(), []);
  const { load, retry } = useWorkflow(readHost, { hubId, id }, focusTitle);
  const name = load.kind === "ready" ? load.value.name : id;
  const body = useRef<HTMLDivElement>(null);
  // The assistant's changes; the page edits through `host`, so an edit inside one accepts it.
  const changes = useWorkflowReview({
    host: readHost,
    review,
    workflow: { hubId, id },
    name,
    page: body,
    title,
    announce,
    load,
    openFileAt,
    showStep: (stepId) => {
      showView("flow");
      setPickedStep(stepId);
    },
  });
  const { host } = changes;
  const settings = useHostRead(
    host,
    { hubId, id },
    (one, ref) => one.configuration(ref),
    focusTitle,
  );
  const everyWorkflow = useHostRead(host, { hubId, id }, (one) => one.list(), focusTitle);
  const runsRead = useRuns(runs, focusTitle);
  // On a desktop the shell's item page keeps the view, so the page learns it as each view is drawn.
  const [view, setView] = useState<WorkflowView>(firstView(startOnTests));
  const itemPage = useRef<ItemPageHandle<WorkflowView>>(null);
  // The canvas unmounts on Configuration, so the page keeps its zoom and pan (D9). They belong to
  // one workflow: the same screen can be handed another, which opens fitted.
  const [kept, setKept] = useState<{ readonly of: string; readonly view: View } | undefined>();
  const workflowKey = `${hubId}/${id}`;
  const keep = useCallback((next: View) => setKept({ of: workflowKey, view: next }), [workflowKey]);
  const [openStep, setOpenStep] = useState<string | undefined>();
  const { dock, setDock, openDock, closeDock, runButton, guideButton, rowCard, setRowCard } =
    useDock(title);
  const [shownId, setShownId] = useState<string | undefined>();
  const pickView = (next: WorkflowView) => {
    // The row's card goes with the Runs view, as it did when the view kept it.
    if (next !== view) setRowCard(undefined);
    setView(next);
  };
  // A view the page opens itself is shown as a pick would show it; focus stays where the page puts it.
  const showView = (next: WorkflowView) => {
    pickView(next);
    itemPage.current?.show(next, focusedNow);
  };
  // The step picked on the canvas, which says what happened to it while a run is shown (4.5).
  const [pickedStep, setPickedStep] = useState<string | undefined>();
  // Closing a step's card focuses its step after the canvas shows: under 800 px the card hid it.
  const closeStepCard = () => {
    const closed = pickedStep;
    flushSync(() => setPickedStep(undefined));
    if (closed !== undefined) stepCardIn(body.current, closed)?.focus();
  };
  // Where focus goes on the canvas once the picked step is removed; a new object asks again.
  const [canvasFocus, setCanvasFocus] = useState<CanvasFocus>();
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
  // Steps another feature asked to see, such as those that run an agent: outlined on Flow, no card.
  const {
    outlined,
    line: outlineLine,
    clear: clearOutline,
  } = useOutline(outline, outlineAsked, load, announce, () => {
    showView("flow");
    setPickedStep(undefined);
  });
  const problemsAsk = useOpenProblems(view, madeTest, { setDock, setMadeTest, showView });
  const phone = usePresentation() === "phone";
  // A step picked on the canvas is the dock's business only while the canvas shows.
  const dockStep = view === "flow" ? pickedStep : undefined;
  const fileProblems = settings.load.kind === "ready" ? settings.load.value.problems : [];
  const errors = countProblems(fileProblems).errors;
  const missingAlias = missingAliasOf(fileProblems);
  const filesWithErrorsList = useFilesWithErrors(filesWithErrors);
  // A problem names its step as the canvas's card does (C544-3).
  const stepName = stepNamesOf(load.kind === "ready" ? load.value.steps : undefined);
  const problems = useProblemsGate(errors);
  const cantStart = useStartRefusal(host, { hubId, id }, errors);
  // `halonic run reply` stops when two hubs have a `reply`, so the command then names the hub.
  const inSeveralHubs =
    everyWorkflow.load.kind === "ready" &&
    everyWorkflow.load.value.some((one) => one.id === id && one.hubId !== hubId);
  const startCommand = startRunCommand(host.folder, inSeveralHubs ? `${hubId}/${id}` : id);
  const needYou = runCount(runsRead.load, { hubId, id }, runs);
  const views = workflowTabs(errors, needYou);
  const shown = useShownRun(runsRead.load, { hubId, id }, runs, shownId);
  // A card at the right narrows the canvas, which then keeps a picked step clear of it.
  const docked = hasDockedCard(
    { dock, host, shown, pickedStep: dockStep },
    { host, workflow: load, pickedStep: dockStep, dock, runShown: shown !== undefined, phone },
  );
  const strip = shown?.line;
  useAnnounceDockedRun(strip, typeof dock === "object", announceState);
  const { startRun } = host;
  const gate = useRunGate(load, startRun !== undefined, sandboxStartCheck);
  // Described by the first line of each band that holds, in the order the page shows them.
  const runUnavailable = unavailableFor(
    problems.unavailable,
    gate.unavailable,
    cantStart.unavailable,
  );
  const saveAsTest = useSaveAsTest(host, { hubId, id }, (testName) => {
    testsMade.current += 1;
    setMadeTest({ name: testName, n: testsMade.current });
    setDock(undefined);
    showView("configuration");
  });
  const canvasEdit = useCanvasEdit(host, { hubId, id }, name, phone, load, announce);
  const rename = useRename(host, { hubId, id }, name, everyWorkflow.load, announce);
  // Run and a guide's button open the start form the same way, and neither while Run can't start.
  const openStart = (opener: DockOpener) => {
    if (startRun === undefined || runUnavailable !== undefined) return;
    setRowCard(undefined);
    openDock(opener);
  };
  const guideSlot = { guide, workflow: { hubId, id }, view, docked, phone, button: guideButton };
  const guidePage = { openRunForm: () => openStart("guide") };
  // Asked for its Run form, the page opens it as Run does, once it knows whether a run can start.
  useAskedForRunForm(runFormAsked, [load, settings.load, cantStart.load], () => openStart("run"));
  const guideScreen = useGuideScreen(guide, { hubId, id });
  const guideRun = useGuideRun(guide, { hubId, id }, shownId, () => {
    setShownId(undefined);
    setDock(undefined);
  });
  // A run the guide's screen started shows here as one started from the Run form does.
  const showRun = (runId: string) => {
    setShownId(runId);
    setPickedStep(undefined);
    setRowCard(undefined);
    showView("flow");
    setDock({ runId });
  };
  const trash = useWorkflowTrash(
    host,
    { hubId, id },
    { name, ready: load.kind === "ready", showInChat },
    title,
  );
  // One chat per name, so the item page keeps it while the page draws again.
  const chat = useMemo(() => chatFor?.(name), [chatFor, name]);
  const instead = insteadOfPage(trash.strip, load, goToWorkflows);
  if (instead !== undefined) return instead;
  const notice = (
    <>
      {changes.bar}
      <WorkflowBands
        name={name}
        hubId={hubId}
        phone={phone}
        problemsBand={{
          problems,
          missingAlias,
          blockingFile: blockingFileOf(filesWithErrorsList, fileProblems, hubId, missingAlias),
          onOpen: problemsAsk.open,
          openFileAt,
          openModels: openModels && (() => openModels()),
        }}
        gate={gate}
        startRow={{
          refusal: cantStart,
          startCommand,
          showStartCommand: !startRun && settings.load.kind === "ready" && errors === 0,
        }}
        agents={agents}
        reviewAndConfirm={reviewAndConfirm}
        openAgent={openAgent}
        announce={announce}
        onSandboxReady={() => (runButton.current ?? title.current)?.focus()}
      />
      <GuideSlot {...guideSlot} page={guidePage} at="top" />
    </>
  );
  const runControl = startRun && (
    <Button
      ref={runButton}
      variant="primary"
      size="sm"
      unavailable={runUnavailable}
      onClick={() => openStart("run")}
    >
      {startWords.run}
    </Button>
  );
  const drawView = (drawn: WorkflowView) => (
    // The container a docked card measures: under 800 px it takes the whole body (DW1).
    <div ref={body} className="@container flex size-full min-h-0">
      {/* First in the DOM, so Tab reaches its button before the canvas; drawn at the right. */}
      <GuideSlot {...guideSlot} page={guidePage} at="right" />
      {/* The view itself; the frame's tab panel holds it with the cards docked beside it. */}
      <div data-workflow-view="" className={panelClass(drawn, { phone, docked })}>
        {drawn === "configuration" && (
          <Configuration
            key={problemsAsk.key}
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
            startOn={problemsAsk.startOn}
            stepName={stepName}
            onOpenStep={(stepId) => {
              setOpenStep(stepId);
              setMadeTest(undefined);
              showView("flow");
            }}
          />
        )}
        {drawn === "runs" && (
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
        {drawn === "flow" && (
          <FlowView
            load={load}
            retry={retry}
            hubId={hubId}
            id={id}
            name={name}
            openStep={openStep}
            problems={fileProblems}
            strip={strip}
            onClearStrip={() => {
              setShownId(undefined);
              setPickedStep(undefined);
              // A run dock goes with the strip, or it would wait for a run that is already listed.
              setDock((now) => (typeof now === "object" ? undefined : now));
            }}
            onSelectStep={(stepId) => {
              clearOutline();
              setPickedStep(stepId);
            }}
            edit={canvasEdit}
            pickedStep={pickedStep}
            outlined={outlined}
            outlineLine={outlineLine}
            docked={docked}
            onClearStep={() => {
              clearOutline();
              setPickedStep(undefined);
            }}
            focus={canvasFocus}
            kept={kept}
            onView={keep}
            caption={drawingCaption(guideRun, phone)}
          />
        )}
      </div>
      <RunDock
        dock={dock}
        host={host}
        workflow={{ hubId, id }}
        workflowName={name}
        problems={{ errors, onOpen: problemsAsk.open }}
        notAnswering={notAnswering}
        startUnavailable={runUnavailable}
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
        guideRun={guideRun}
        reviewInInbox={reviewInInbox}
        phone={phone}
      />
      <StepEditDock
        host={host}
        workflow={load}
        pickedStep={dockStep}
        dock={dock}
        runShown={shown !== undefined}
        phone={phone}
        saving={saving}
        problems={fileProblems}
        stepName={stepName}
        onOpenStep={setPickedStep}
        onRemoved={(next) => {
          setPickedStep(undefined);
          setCanvasFocus({ step: next });
        }}
        announce={announce}
        onClose={closeStepCard}
      />
    </div>
  );
  const page = (
    <WorkflowFrame
      phone={phone}
      name={name}
      ready={load.kind === "ready"}
      rename={rename}
      title={title}
      menu={trash.menu}
      actions={trash.actions}
      views={views}
      view={view}
      onPickView={(next) => {
        // A direct tab click must not re-pick the card a problem link opened.
        setOpenStep(undefined);
        // The test just made was shown once; coming back opens Configuration on General.
        if (next !== view) setMadeTest(undefined);
        pickView(next);
      }}
      onViewShown={setView}
      handle={itemPage}
      run={runControl}
      notice={notice}
      chat={chat}
      closeStack={closeStack}
    >
      {drawView}
    </WorkflowFrame>
  );
  return pageOrGuideScreen(
    <WorkflowReviewContext value={changes.marks}>{page}</WorkflowReviewContext>,
    guideScreen,
    { workflow: { hubId, id }, phone, showRun, announce },
  );
}

/** The element with the focus, so showing a view leaves it there. */
function focusedNow(): HTMLElement | null {
  return document.activeElement instanceof HTMLElement ? document.activeElement : null;
}
