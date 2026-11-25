import { Callout } from "@halonicjs/studio-kit";
import { copyDetailsWords, useCopyDetails } from "@halonicjs/studio-shell";
import { useId } from "react";
import {
  isRunning,
  nextStep,
  type StepperActions,
  type StepperService,
  type StepperView,
  type StepView,
} from "../stepper-view.ts";
import { BrowserControls, BrowserCopy, BrowserInstructions } from "./browser-step.tsx";
import { StepByHand } from "./manual-guide.tsx";
import { RiskChip } from "./request-review.tsx";
import { focusMarks } from "./stepper-changes.ts";
import { failureDetails, outcomeText, stepLabel, stepsHeading } from "./stepper-words.ts";

/** Props for {@link StepList}. */
export interface StepListProps {
  readonly view: StepperView;
  readonly actions: StepperActions;
  /** Whether the steps can be worked on now: only while the request is `ready`. */
  readonly active: boolean;
  /**
   * Whether the request can only be reviewed here, such as Studio before the desktop shell runs
   * steps: each browser step then offers **Copy instructions** alone, so the user can still do it.
   */
  readonly reviewOnly?: boolean;
  /** The `id` for the running step's "Running…" line, which says why the other buttons wait. */
  readonly runningId: string;
}

/**
 * The request's steps in order (`action-steppers.run`): each with its number, its risk, what it
 * does in plain words, a browser step's page and instructions, and, once it has started, how it
 * went. A failure names the service and its status, with the service's own message behind
 * **Copy details**; the stepper's status region reads each result out as it arrives. While the
 * request is ready, each step not done has **Do it by hand**, and the next browser step has its
 * own controls.
 */
export function StepList({ view, actions, active, reviewOnly = false, runningId }: StepListProps) {
  const headingId = useId();
  if (view.steps.length === 0) return null;
  const next = active ? nextStep(view) : undefined;
  const waits = isRunning(view) ? { reason: runningId } : undefined;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h3 id={headingId} className="text-body-strong text-fg">
        {stepsHeading}
      </h3>
      <ol className="flex flex-col divide-y divide-border rounded-md border border-border">
        {view.steps.map((step) => (
          <li key={step.number} data-step={step.number} className="flex flex-col gap-2 py-4">
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
              {reviewOnly && step.action.kind === "browser" ? (
                <BrowserCopy action={step.action} requester={view.requester} />
              ) : null}
              {step === next && step.action.kind === "browser" ? (
                <BrowserControls
                  number={step.number}
                  action={step.action}
                  requester={view.requester}
                  actions={actions}
                  waits={waits}
                />
              ) : null}
              <StepOutcomeLine step={step} service={view.service} runningId={runningId} />
            </div>
            {active ? (
              <StepByHand view={view} number={step.number} actions={actions} waits={waits} />
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function StepOutcomeLine({
  step,
  service,
  runningId,
}: {
  readonly step: StepView;
  readonly service: StepperService;
  readonly runningId: string;
}) {
  const copy = useCopyDetails();
  const text = outcomeText(step.outcome, service);
  if (text === null) return null;
  if (step.outcome.kind === "failed") {
    const details = failureDetails(step.outcome.status, step.outcome.message, service);
    return (
      <Callout
        tone="danger"
        action={{ label: copyDetailsWords.label, onClick: () => copy(details) }}
      >
        {text}
      </Callout>
    );
  }
  // Focus comes here once the step was done from its own controls, which went with it.
  return (
    <p
      id={step.outcome.kind === "running" ? runningId : undefined}
      data-focus={focusMarks.stepOutcome}
      tabIndex={-1}
      className="focus-ring text-small text-fg-muted"
    >
      {text}
    </p>
  );
}
