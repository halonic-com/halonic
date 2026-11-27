import { Callout, Disclosure, StatusChip, type StatusChipTone } from "@halonicjs/studio-kit";
import { type ReactNode, useId } from "react";
import {
  irreversibleStepsAhead,
  type StepAction,
  type StepperChange,
  type StepperView,
  type StepRisk,
  type StepView,
} from "../stepper-view.ts";
import {
  actionLine,
  changedValueText,
  changeWords,
  expiresText,
  factLabels,
  hideRequest,
  irreversibleTitle,
  notSignedIn,
  requesterText,
  riskWords,
  showRequest,
  touchText,
} from "./stepper-words.ts";

/** A risk's chip colour: the higher the risk, the louder. */
const riskTones: Record<StepRisk, StatusChipTone> = {
  routine: "neutral",
  admin: "attention",
  irreversible: "danger",
};

/** The risk as a chip, its word always written out. */
export function RiskChip({ risk }: { readonly risk: StepRisk }) {
  return <StatusChip tone={riskTones[risk]}>{riskWords[risk]}</StatusChip>;
}

/**
 * The review's facts (`action-steppers.review`): first what the stepper touches, each target and
 * page, then the account, the risk, the expiry and who asked, then their reason as quoted plain
 * text. React writes the reason as a text node, so Markdown and links in it stay characters.
 */
export function RequestFacts({ view }: { readonly view: StepperView }) {
  const touchesId = useId();
  return (
    <div className="flex flex-col gap-4">
      {view.touches.length === 0 ? null : (
        <section aria-labelledby={touchesId} className="flex flex-col gap-1">
          <h3 id={touchesId} className="text-body-strong text-fg">
            {factLabels.touches}
          </h3>
          <ul className="list-disc pl-5 text-body text-fg">
            {view.touches.map((touch) => (
              <li key={touchText(touch)} className="wrap-break-word">
                {touchText(touch)}
              </li>
            ))}
          </ul>
        </section>
      )}
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-body">
        <Fact label={factLabels.account}>{view.account ?? notSignedIn}</Fact>
        <Fact label={factLabels.risk}>
          <RiskChip risk={view.risk} />
        </Fact>
        <Fact label={factLabels.expires}>{expiresText(view.expiresAt)}</Fact>
        <Fact label={factLabels.requester}>{requesterText(view.requester)}</Fact>
      </dl>
      <figure className="flex flex-col gap-1">
        <figcaption className="text-small text-fg-muted">{factLabels.reason}</figcaption>
        <blockquote className="border-l-2 border-border pl-3 text-body text-fg whitespace-pre-wrap wrap-break-word">
          {view.reason}
        </blockquote>
      </figure>
    </div>
  );
}

/**
 * A warning for each step that can't be undone, under the facts and before anything runs
 * (HAL-17491 6.4): the step's number, then what it does in its own words.
 */
export function IrreversibleWarnings({ view }: { readonly view: StepperView }) {
  return irreversibleStepsAhead(view).map((step) => (
    <Callout key={step.number} tone="attention" title={irreversibleTitle(step.number)}>
      {step.preview}
    </Callout>
  ));
}

/**
 * Each value that changed since the request (`action-steppers.expect-stop`): its name, what the
 * requester saw and what the check read today. The values come from the requester and the
 * service, so they show as code, apart from Halonic's own sentence above them.
 */
export function ChangedValues({ changes }: { readonly changes: readonly StepperChange[] }) {
  // A `requires` stop has no changed values; an empty list would only add a gap.
  if (changes.length === 0) return null;
  const code = "font-mono text-small text-fg wrap-anywhere";
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-body">
      {changes.map((change) => {
        const today = changedValueText(change.current);
        return (
          <div key={change.name} className="contents">
            <dt>
              <code className={code}>{change.name}</code>
            </dt>
            <dd className="flex min-w-0 flex-col text-fg">
              <span>
                {changeWords.expected}{" "}
                <code className={code}>{changedValueText(change.expected)}</code>
              </span>
              <span>
                {changeWords.today}{" "}
                {today === undefined ? changeWords.notRead : <code className={code}>{today}</code>}
              </span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function Fact({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="min-w-0 text-fg wrap-break-word">{children}</dd>
    </>
  );
}

/** A step as "Show the request" writes it: the exact call, or what the step does instead. */
function actionText(action: StepAction): string {
  if (action.kind !== "call") return actionLine(action);
  const { method, address, body } = action.call;
  return body === undefined ? `${method} ${address}` : `${method} ${address}\n\n${body}`;
}

/** "Show the request": every step's method, address and body, exactly as they will be sent. */
export function RequestCalls({ steps }: { readonly steps: readonly StepView[] }) {
  if (steps.length === 0) return null;
  return (
    <Disclosure summary={showRequest} openSummary={hideRequest}>
      <ol className="flex flex-col gap-3 px-4 pb-4">
        {steps.map((step) => (
          <li key={step.number}>
            {/* Wrapped, never scrolled sideways: a 390px phone shows the whole call. */}
            <pre className="rounded-sm bg-surface-subtle p-3 font-mono text-small text-fg whitespace-pre-wrap wrap-anywhere">
              {actionText(step.action)}
            </pre>
          </li>
        ))}
      </ol>
    </Disclosure>
  );
}
