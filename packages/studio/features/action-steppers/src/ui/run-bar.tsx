import { Button, Dialog } from "@halonicjs/studio-kit";
import { useState } from "react";
import {
  canRunAll,
  isRunning,
  needsConfirmation,
  nextStep,
  type StepperActions,
  type StepperView,
  type StepView,
} from "../stepper-view.ts";
import { confirmWords, runWords } from "./stepper-words.ts";

/** Whether the bar runs the step: an API call, or a part of the service's own sign-in. */
function runsFromBar(step: StepView): boolean {
  return step.action.kind === "call" || step.action.kind === "sign-in";
}

/** Props for {@link RunBar}. */
export interface RunBarProps {
  readonly view: StepperView;
  readonly actions: StepperActions;
  /** The `id` of the running step's "Running…" line, which says why the bar's buttons wait. */
  readonly runningId: string;
}

/**
 * The bar under a ready request (`action-steppers.run`): **Run step 2 of 3** for the next step, or
 * **Try step 2 again** after it failed, the same for each part of a sign-in step, **Run all steps** only when every step is a routine call,
 * and **Decline**. A browser step has its own controls in the list instead. An irreversible step
 * asks once more in a dialog before `runStep` is called.
 */
export function RunBar({ view, actions, runningId }: RunBarProps) {
  const [confirming, setConfirming] = useState<StepView | null>(null);
  const step = nextStep(view);
  const running = isRunning(view);
  const waits = running ? { reason: runningId } : undefined;
  const total = view.steps.length;

  const run = (chosen: StepView) => {
    if (running) return;
    if (needsConfirmation(chosen)) setConfirming(chosen);
    else actions.runStep(chosen.number);
  };

  return (
    <div className="flex flex-wrap gap-2 border-t border-border p-4">
      {step === undefined || !runsFromBar(step) ? null : (
        <Button
          // While the service is down the run will likely fail, so it isn't the suggested action.
          variant={view.serviceDown ? "secondary" : "primary"}
          busy={step.outcome.kind === "running"}
          busyLabel={runWords.busy(step.number)}
          onClick={() => run(step)}
        >
          {step.outcome.kind === "failed"
            ? runWords.retry(step.number)
            : runWords.step(step.number, total)}
        </Button>
      )}
      {canRunAll(view) ? (
        <Button unavailable={waits} onClick={() => (running ? undefined : actions.runAll())}>
          {runWords.all}
        </Button>
      ) : null}
      <Button
        // Secondary wherever Decline shows, like the Inbox's Reject next to Approve.
        variant="secondary"
        unavailable={waits}
        onClick={() => (running ? undefined : actions.decline())}
      >
        {runWords.decline}
      </Button>
      {confirming === null ? null : (
        <Dialog
          title={confirmWords.title(confirming.number)}
          size="sm"
          alert
          confirm={{
            label: confirmWords.confirm(confirming.number),
            variant: "danger",
            busyLabel: confirmWords.busy,
          }}
          onConfirm={() => {
            setConfirming(null);
            if (!running) actions.runStep(confirming.number);
          }}
          onCancel={() => setConfirming(null)}
        >
          <p className="text-body text-fg wrap-break-word">{confirming.preview}</p>
          <p className="text-body text-fg">{confirmWords.body}</p>
        </Dialog>
      )}
    </div>
  );
}
