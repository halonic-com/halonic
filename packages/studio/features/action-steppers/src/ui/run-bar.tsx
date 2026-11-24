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

/** Props for {@link RunBar}. */
export interface RunBarProps {
  readonly view: StepperView;
  readonly actions: StepperActions;
}

/**
 * The bar under a ready request (`action-steppers.run`): **Run step 2 of 3** for the next step, or
 * **Try step 2 again** after it failed, **Run all steps** only when every step is routine, and
 * **Decline**. An irreversible step asks once more in a dialog before `runStep` is called.
 */
export function RunBar({ view, actions }: RunBarProps) {
  const [confirming, setConfirming] = useState<StepView | null>(null);
  const step = nextStep(view);
  const running = isRunning(view);
  const total = view.steps.length;

  const run = (chosen: StepView) => {
    if (running) return;
    if (needsConfirmation(chosen)) setConfirming(chosen);
    else actions.runStep(chosen.number);
  };

  return (
    <div className="flex flex-wrap gap-2 border-t border-border p-4">
      {step === undefined ? null : (
        <Button
          variant="primary"
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
        <Button onClick={() => (running ? undefined : actions.runAll())}>{runWords.all}</Button>
      ) : null}
      <Button variant="ghost" onClick={() => (running ? undefined : actions.decline())}>
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
            actions.runStep(confirming.number);
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
