import { Button, CloseIcon, EmptyState, SkeletonBar } from "@halonicjs/studio-kit";
import type { View } from "../canvas/geometry.ts";
import type { ShownRun } from "../start/run-strip.ts";
import { startWords } from "../start/start-words.ts";
import { pageWords } from "./page-words.ts";
import type { useWorkflow } from "./use-workflow.ts";
import { WorkflowCanvas } from "./workflow-canvas.tsx";

/** Props for {@link FlowView}. */
export interface FlowViewProps {
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
  /** The step picked on the page; the canvas's selection follows it when a card closes. */
  readonly pickedStep: string | undefined;
  /** A click on the canvas's background: the picked step's card closes. */
  readonly onClearStep: () => void;
  readonly kept: { readonly of: string; readonly view: View } | undefined;
  readonly onView: (next: View) => void;
}

/** The Flow tab's content: the canvas, a skeleton when the file is slow, or why it couldn't be read. */
export function FlowView({
  load,
  retry,
  hubId,
  id,
  name,
  openStep,
  strip,
  onClearStrip,
  onSelectStep,
  pickedStep,
  onClearStep,
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
          picked={pickedStep}
          onBackgroundClick={onClearStep}
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
