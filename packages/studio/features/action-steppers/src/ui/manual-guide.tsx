import { Button, Disclosure } from "@halonicjs/studio-kit";
import type { ManualForm, StepperActions, StepperView } from "../stepper-view.ts";
import { isDone, showsManualFirst } from "../stepper-view.ts";
import { manualWords, stepLabel } from "./stepper-words.ts";

/** One step's manual form: the page, the numbered lines and how to check it worked. */
function ManualSteps({
  manual,
  openPage,
}: {
  readonly manual: ManualForm;
  readonly openPage: StepperActions["openPage"];
}) {
  const address = manual.address;
  return (
    <div className="flex flex-col gap-2 px-4 pb-4">
      {address === undefined ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-small text-fg wrap-break-word">{address}</span>
          <Button size="sm" onClick={() => openPage(address)}>
            {manualWords.open}
          </Button>
        </div>
      )}
      <ol className="list-decimal pl-5 text-body text-fg">
        {manual.lines.map((line) => (
          <li key={line} className="wrap-break-word">
            {line}
          </li>
        ))}
      </ol>
      {manual.check === undefined ? null : (
        <p className="text-small text-fg-muted">{manualWords.check(manual.check)}</p>
      )}
    </div>
  );
}

/** Props for {@link StepByHand}. */
export interface StepByHandProps {
  readonly view: StepperView;
  readonly number: number;
  readonly actions: StepperActions;
}

/**
 * A step's **Do it by hand** (`action-steppers.by-hand`): its manual form, open by itself when the
 * step failed or the service is down, and **Mark done by hand**, which runs the step's check where
 * it has one and otherwise records it as not checked (HAL-17491 7.8).
 */
export function StepByHand({ view, number, actions }: StepByHandProps) {
  const step = view.steps.find((candidate) => candidate.number === number);
  if (step === undefined || isDone(step)) return null;
  const openFirst = showsManualFirst(view, step);
  const running = step.outcome.kind === "running";
  return (
    // A new key when it should open by itself, since a Disclosure reads `defaultOpen` once.
    <Disclosure
      key={openFirst ? "open" : "closed"}
      summary={manualWords.step}
      openSummary={manualWords.hide}
      tone="value"
      defaultOpen={openFirst}
    >
      <ManualSteps manual={step.manual} openPage={actions.openPage} />
      <div className="px-4 pb-4">
        <Button
          onClick={() => {
            if (running) return;
            if (step.hasCheck) actions.checkStep(number);
            else actions.markDoneByHand(number);
          }}
        >
          {manualWords.markDone}
        </Button>
      </div>
    </Disclosure>
  );
}

/** **Do it all by hand**: the whole request's manual guide, step by step. */
export function ManualGuide({
  view,
  actions,
}: {
  readonly view: StepperView;
  readonly actions: StepperActions;
}) {
  if (view.steps.length === 0) return null;
  return (
    <Disclosure
      key={view.serviceDown ? "open" : "closed"}
      summary={manualWords.stepper}
      openSummary={manualWords.hide}
      defaultOpen={view.serviceDown}
    >
      <ol className="flex flex-col gap-2">
        {view.steps.map((step) => (
          <li key={step.number}>
            <p className="px-4 text-small text-fg-muted">
              {stepLabel(step.number, view.steps.length)}
            </p>
            <ManualSteps manual={step.manual} openPage={actions.openPage} />
          </li>
        ))}
      </ol>
    </Disclosure>
  );
}
