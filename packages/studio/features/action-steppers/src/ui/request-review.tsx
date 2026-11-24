import { Disclosure, StatusChip, type StatusChipTone } from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import type { StepperView, StepRisk, StepView } from "../stepper-view.ts";
import {
  expiresText,
  factLabels,
  hideRequest,
  notSignedIn,
  requesterText,
  riskWords,
  showRequest,
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
 * The review's facts (`action-steppers.review`): the account, the target, the risk, the expiry and
 * who asked, then their reason as quoted plain text. React writes the reason as a text node, so
 * Markdown and links in it stay characters; it is never parsed.
 */
export function RequestFacts({ view }: { readonly view: StepperView }) {
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-body">
        <Fact label={factLabels.account}>{view.account ?? notSignedIn}</Fact>
        <Fact label={factLabels.target}>{view.target}</Fact>
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

function Fact({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="min-w-0 text-fg wrap-break-word">{children}</dd>
    </>
  );
}

/** "Show the request": every step's method, address and body, exactly as they will be sent. */
export function RequestCalls({ steps }: { readonly steps: readonly StepView[] }) {
  if (steps.length === 0) return null;
  return (
    <Disclosure summary={showRequest} openSummary={hideRequest}>
      <ol className="flex flex-col gap-3 px-4 pb-4">
        {steps.map((step) => (
          <li key={step.number}>
            <pre className="overflow-x-auto rounded-sm bg-surface-subtle p-3 font-mono text-small text-fg">
              {[`${step.call.method} ${step.call.address}`, step.call.body]
                .filter((line) => line !== undefined)
                .join("\n\n")}
            </pre>
          </li>
        ))}
      </ol>
    </Disclosure>
  );
}
