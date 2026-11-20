import type { ShownRuns } from "@halonicjs/studio-feature-inbox/api";
import type { RunRow, RunsSource } from "@halonicjs/studio-feature-runs/api";
import { Button, CloseIcon } from "@halonicjs/studio-kit";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import type { WorkflowRef, WorkflowsHost } from "../api.ts";
import { RunCard } from "../runs/run-card.tsx";
import { realRunsOf, runRowsOf } from "../runs/runs-model.ts";
import type { SaveAsTestProps } from "../runs/save-as-test.tsx";
import { StepInRunCard } from "../runs/step-card.tsx";
import { stepInRun } from "../runs/step-in-run.ts";
import type { RunsLoad } from "../runs/use-runs.ts";
import { shownRun } from "../start/run-strip.ts";
import { StartRunCard } from "../start/start-card.tsx";
import { startWords } from "../start/start-words.ts";

/** The run the page started, as its row and strip say it, once the runs have it; absent before. */
export function useShownRun(
  load: RunsLoad,
  workflow: WorkflowRef,
  source: RunsSource,
  runId: string | undefined,
) {
  const runs = load.kind === "ready" ? load.runs : undefined;
  return useMemo(() => {
    if (runs === undefined || runId === undefined) return undefined;
    const run = realRunsOf(runs, workflow).find((one) => one.summary.id === runId);
    const row = runRowsOf(runs, workflow, source, new Date()).find((one) => one.id === runId);
    if (run === undefined || row === undefined) return undefined;
    const { summary } = run;
    return {
      run,
      row,
      source,
      runs,
      line: shownRun(row, run, source.workflow(summary.hubId, summary.workflowId)),
    };
  }, [runs, runId, workflow.hubId, workflow.id, source]);
}

/** The run input of the workflow's first test, as JSON text; `undefined` when it has no test or they can't be read. */
async function firstTestInput(
  host: WorkflowsHost,
  workflow: WorkflowRef,
): Promise<string | undefined> {
  try {
    return (await host.tests(workflow)).cases[0]?.input;
  } catch {
    return undefined;
  }
}

export type Dock = "start" | { readonly runId: string } | undefined;

/**
 * The page's cards: the one docked at the right (the start form, then the run it started; C18,
 * C25), and the run whose card the Runs view docks. The page keeps both, so only one card shows at
 * a time: two side by side leave the list no room. A docked card that closes gives focus back to
 * the Run button that opened it (`runButton`), or to the workflow's name (`title`) on a page
 * without one, rather than dropping it to the body (DK1).
 */
export function useDock(title: RefObject<HTMLElement | null>) {
  const [dock, setDock] = useState<Dock>();
  const [rowCard, setRowCard] = useState<string | undefined>();
  const runButton = useRef<HTMLButtonElement>(null);
  const closeDock = () => {
    setDock(undefined);
    (runButton.current ?? title.current)?.focus();
  };
  return { dock, setDock, closeDock, runButton, rowCard, setRowCard };
}

interface RunDockProps {
  readonly dock: Dock;
  readonly host: WorkflowsHost;
  readonly workflow: WorkflowRef;
  /** The workflow's name, for the start card's title. */
  readonly workflowName: string;
  readonly notAnswering: string;
  readonly shown: ReturnType<typeof useShownRun>;
  /** Where the run card notes its run, so the Inbox leaves it out of its news; see `ShownRuns`. */
  readonly shownRuns?: ShownRuns | undefined;
  readonly onDock: (next: Dock) => void;
  /** Closes the docked card and gives its focus back to the page (DK1). */
  readonly onClose: () => void;
  readonly onStarted: (runId: string) => void;
  readonly openRun: ((runId: string, step?: string) => void) | undefined;
  /** Opens the workspace page at Models, for **Open Models** on the run card's banner. */
  readonly openModels: (() => void) | undefined;
  /** Opens the workspace page at its Budget block, for **Change budget** on the run card's banner. */
  readonly openBudget: (() => void) | undefined;
  /** Says a line to a screen reader, for why the run card's **Run again** didn't start. */
  readonly announce: ((line: string) => void) | undefined;
  readonly saveAsTest: (row: RunRow) => SaveAsTestProps | undefined;
  /** The step picked on the canvas; while a run is shown its card replaces the run's. */
  readonly pickedStep: string | undefined;
  readonly onClosePickedStep: () => void;
}

/**
 * The dock between **Start run** and the run showing in the runs. Its line takes focus at once,
 * as the button that had it is gone; the run's card heading takes it over when the run shows (A6).
 */
function WaitingForRun({ onClose }: { readonly onClose: () => void }) {
  const line = useRef<HTMLParagraphElement>(null);
  useEffect(() => line.current?.focus(), []);
  // The runs source hasn't listed the new run yet; the card takes its place when it does.
  return (
    <aside
      role="status"
      aria-label={startWords.cardKind}
      className="flex w-80 max-w-full shrink-0 items-start justify-between gap-3 border-s border-border p-4 text-small text-fg-muted"
    >
      <p ref={line} tabIndex={-1} className="outline-none">
        {startWords.waitingForRun}
      </p>
      <Button
        variant="ghost"
        size="sm"
        icon={<CloseIcon />}
        label={startWords.closeCard}
        onClick={onClose}
      />
    </aside>
  );
}

/** Whether {@link RunDock} shows a card for these props, following its branches; on a phone the card then takes the page's body. */
export function dockHasCard({
  dock,
  host,
  shown,
  pickedStep,
}: Pick<RunDockProps, "dock" | "host" | "shown" | "pickedStep">): boolean {
  if (dock === "start") return host.startRun !== undefined;
  return typeof dock === "object" || (shown !== undefined && pickedStep !== undefined);
}

/** The card docked at the right: the start form, then the simple card of the run it started. */
export function RunDock({
  dock,
  host,
  workflow,
  workflowName,
  notAnswering,
  shown,
  shownRuns,
  onDock,
  onClose,
  onStarted,
  openRun,
  openModels,
  openBudget,
  announce,
  saveAsTest,
  pickedStep,
  onClosePickedStep,
}: RunDockProps) {
  const { startRun } = host;
  const started = (runId: string) => {
    onStarted(runId);
    onDock({ runId });
  };
  // The run card says when its run needs you, so the Inbox doesn't say it too while it shows.
  const cardRunId =
    typeof dock === "object" && shown && pickedStep === undefined ? shown.row.id : undefined;
  useEffect(() => {
    if (shownRuns === undefined || cardRunId === undefined) return undefined;
    return shownRuns.add(cardRunId, { kind: "workflow", hub: workflow.hubId, id: workflow.id });
  }, [shownRuns, cardRunId, workflow.hubId, workflow.id]);
  if (shown && pickedStep !== undefined && dock !== "start") {
    return (
      <StepInRunCard
        key={pickedStep}
        stepId={pickedStep}
        inRun={stepInRun(pickedStep, shown.row, shown.run)}
        onClose={onClosePickedStep}
        onSeeInAndOut={openRun && (() => openRun(shown.row.id, pickedStep))}
      />
    );
  }
  if (dock === "start" && startRun) {
    return (
      <StartRunCard
        workflowName={workflowName}
        firstTestInput={() => firstTestInput(host, workflow)}
        start={(input) => startRun.call(host, workflow, input)}
        notAnswering={notAnswering}
        onStarted={started}
        onClose={onClose}
      />
    );
  }
  if (typeof dock === "object" && !shown) {
    return <WaitingForRun onClose={onClose} />;
  }
  if (typeof dock === "object" && shown) {
    return (
      <RunCard
        key={shown.row.id}
        source={shown.source}
        runs={shown.runs}
        row={shown.row}
        run={shown.run}
        onClose={onClose}
        onOpenLog={openRun && (() => openRun(shown.row.id))}
        saveAsTest={saveAsTest(shown.row)}
        {...(startRun && {
          // Run again shows the new run here, as Start run does (C18).
          runAgain: {
            runStart: {
              startRun: ({ hubId, workflowId }, input) =>
                startRun.call(host, { hubId, id: workflowId }, input),
            },
            onStarted: started,
            announce,
          },
        })}
        openModels={openModels}
        openBudget={openBudget}
      />
    );
  }
  return null;
}
