import { Callout } from "@halonicjs/studio-kit";
import { useId } from "react";
import {
  isRunning,
  nextStep,
  type StepperActions,
  type StepperService,
  type StepperView,
  type StepView,
} from "../stepper-view.ts";
import { BrowserControls, BrowserInstructions } from "./browser-step.tsx";
import { StepByHand } from "./manual-guide.tsx";
import { RiskChip } from "./request-review.tsx";
import { outcomeText, stepLabel, stepsHeading } from "./stepper-words.ts";

/** Props for {@link StepList}. */
export interface StepListProps {
  readonly view: StepperView;
  readonly actions: StepperActions;
  /** Whether the steps can be worked on now: only while the request is `ready`. */
  readonly active: boolean;
}

/**
 * The request's steps in order (`action-steppers.run`): each with its number, its risk, what it
 * does in plain words, a browser step's page and instructions, and, once it has started, how it
 * went. A failure says the service's status and its own message, and is announced, since the run
 * stops there. While the request is ready, each step not done has **Do it by hand**, and the next
 * browser step has its own controls.
 */
export function StepList({ view, actions, active }: StepListProps) {
  const headingId = useId();
  if (view.steps.length === 0) return null;
  const next = active ? nextStep(view) : undefined;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h3 id={headingId} className="text-body-strong text-fg">
        {stepsHeading}
      </h3>
      <ol className="flex flex-col divide-y divide-border rounded-md border border-border">
        {view.steps.map((step) => (
          <li key={step.number} className="flex flex-col gap-2 py-4">
            <div className="flex flex-col gap-2 px-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-small text-fg-muted">
                  {stepLabel(step.number, view.steps.length)}
                </span>
                <RiskChip risk={step.risk} />
              </div>
              <p className="text-body text-fg wrap-break-word">{step.preview}</p>
              {step.action.kind === "browser" ? (
                <BrowserInstructions action={step.action} requester={view.requester} />
              ) : null}
              {step === next && step.action.kind === "browser" ? (
                <BrowserControls
                  number={step.number}
                  action={step.action}
                  requester={view.requester}
                  actions={actions}
                  running={isRunning(view)}
                />
              ) : null}
              <StepOutcomeLine step={step} service={view.service} />
            </div>
            {active ? <StepByHand view={view} number={step.number} actions={actions} /> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function StepOutcomeLine({
  step,
  service,
}: {
  readonly step: StepView;
  readonly service: StepperService;
}) {
  const text = outcomeText(step.outcome, service);
  if (text === null) return null;
  if (step.outcome.kind === "failed") {
    return (
      <Callout tone="danger" announce="polite">
        {text}
      </Callout>
    );
  }
  return <p className="text-small text-fg-muted">{text}</p>;
}
