import type { RunRow, RunsSource } from "@halonicjs/studio-feature-runs/api";
import { Button, CloseIcon } from "@halonicjs/studio-kit";
import { useMemo } from "react";
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

export type Dock = "start" | { readonly runId: string } | undefined;

interface RunDockProps {
  readonly dock: Dock;
  readonly host: WorkflowsHost;
  readonly workflow: WorkflowRef;
  readonly notAnswering: string;
  readonly shown: ReturnType<typeof useShownRun>;
  readonly onDock: (next: Dock) => void;
  readonly onStarted: (runId: string) => void;
  readonly openRun: ((runId: string, step?: string) => void) | undefined;
  readonly saveAsTest: (row: RunRow) => SaveAsTestProps | undefined;
  /** The step picked on the canvas; while a run is shown its card replaces the run's. */
  readonly pickedStep: string | undefined;
  readonly onClosePickedStep: () => void;
}

/** The card docked at the right: the start form, then the simple card of the run it started. */
export function RunDock({
  dock,
  host,
  workflow,
  notAnswering,
  shown,
  onDock,
  onStarted,
  openRun,
  saveAsTest,
  pickedStep,
  onClosePickedStep,
}: RunDockProps) {
  const { startRun } = host;
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
        start={(input) => startRun.call(host, workflow, input)}
        notAnswering={notAnswering}
        onStarted={(runId) => {
          onStarted(runId);
          onDock({ runId });
        }}
        onClose={() => onDock(undefined)}
      />
    );
  }
  if (typeof dock === "object" && !shown) {
    // The runs source hasn't listed the new run yet; the card takes its place when it does.
    return (
      <aside
        role="status"
        aria-label={startWords.cardKind}
        className="flex w-80 shrink-0 items-start justify-between gap-3 border-s border-border p-4 text-small text-fg-muted"
      >
        <p>{startWords.waitingForRun}</p>
        <Button
          variant="ghost"
          size="sm"
          icon={<CloseIcon />}
          label={startWords.closeCard}
          onClick={() => onDock(undefined)}
        />
      </aside>
    );
  }
  if (typeof dock === "object" && shown) {
    return (
      <RunCard
        key={shown.row.id}
        source={shown.source}
        runs={shown.runs}
        row={shown.row}
        run={shown.run}
        onClose={() => onDock(undefined)}
        onOpenLog={openRun && (() => openRun(shown.row.id))}
        saveAsTest={saveAsTest(shown.row)}
      />
    );
  }
  return null;
}
