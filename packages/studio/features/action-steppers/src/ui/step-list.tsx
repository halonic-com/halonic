import { Callout } from "@halonicjs/studio-kit";
import { useId } from "react";
import type { StepperService, StepView } from "../stepper-view.ts";
import { RiskChip } from "./request-review.tsx";
import { outcomeText, stepLabel, stepsHeading } from "./stepper-words.ts";

/** Props for {@link StepList}. */
export interface StepListProps {
  readonly steps: readonly StepView[];
  readonly service: StepperService;
}

/**
 * The request's steps in order (`action-steppers.run`): each with its number, its risk, what it
 * does in plain words and, once it has started, how it went. A failure says the service's status
 * and its own message, and is announced, since the run stops there.
 */
export function StepList({ steps, service }: StepListProps) {
  const headingId = useId();
  if (steps.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h3 id={headingId} className="text-body-strong text-fg">
        {stepsHeading}
      </h3>
      <ol className="flex flex-col divide-y divide-border rounded-md border border-border">
        {steps.map((step) => (
          <li key={step.number} className="flex flex-col gap-2 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-small text-fg-muted">
                {stepLabel(step.number, steps.length)}
              </span>
              <RiskChip risk={step.risk} />
            </div>
            <p className="text-body text-fg wrap-break-word">{step.preview}</p>
            <StepOutcomeLine step={step} service={service} />
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
