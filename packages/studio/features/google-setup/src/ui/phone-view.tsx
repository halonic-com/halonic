import type { SetupStep } from "@halonicjs/google-setup";
import { ViewOnlyLine } from "@halonicjs/studio-kit";
import type { GoogleSetupAccount } from "../api.ts";
import { connectorProblem } from "../connector-problem.ts";
import { stepTitle } from "../step-names.ts";
import { accountTypeNames, listNames } from "./account-labels.ts";
import { currentStep } from "./checklist.tsx";
import { ProblemBanner } from "./problem-banner.tsx";
import { StepMark, type StepState, stepStateWords } from "./step-mark.tsx";

/** Props for {@link PhoneView}. */
export interface PhoneViewProps {
  readonly account: GoogleSetupAccount;
  /** The generated steps, in order. The count and the order come from here alone. */
  readonly steps: readonly SetupStep[];
}

function stateOf(step: SetupStep, current: SetupStep | undefined, done: boolean): StepState {
  if (step.id === current?.id) return "now";
  return done ? "done" : "todo";
}

/**
 * The Google setup item on a phone (UX checklist 2.6): read-only. It says the setup waits for a
 * computer, shows the account, its services and its progress as text, then every step's title and
 * state; the current step adds "Continue on a computer." It has no buttons, no fields and no
 * Start over: Google Cloud Console is hard to use on a phone.
 */
export function PhoneView({ account, steps }: PhoneViewProps) {
  const current = currentStep(account, steps);
  const problem = connectorProblem(account);
  const doneCount = steps.filter((step) => account.record.stepsDone[step.id] !== undefined).length;
  return (
    <section aria-labelledby="google-setup-phone-title" className="flex flex-col gap-4 p-4">
      <h2 id="google-setup-phone-title" className="text-title">
        Google for {account.email}
      </h2>
      <ViewOnlyLine>
        {`Set this up on a computer. Google Cloud Console is hard to use on a phone.${account.askAccountType ? " Choose the account type on a computer first." : ""}`}
      </ViewOnlyLine>
      {problem === undefined ? null : (
        <>
          <ProblemBanner problem={problem} />
          <ViewOnlyLine>Fix this on your computer: Library › Connectors</ViewOnlyLine>
        </>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body">
        <dt className="text-fg-muted">Account</dt>
        <dd>
          {account.askAccountType ? "Not chosen yet" : accountTypeNames[account.record.accountType]}
        </dd>
        <dt className="text-fg-muted">For</dt>
        <dd>{listNames(account.services.map((service) => service.label))}</dd>
        <dt className="text-fg-muted">Progress</dt>
        <dd>
          {doneCount} of {steps.length} steps done
        </dd>
      </dl>
      <ol className="flex flex-col gap-3">
        {steps.map((step) => {
          const done = account.record.stepsDone[step.id] !== undefined;
          const state = stateOf(step, current, done);
          return (
            <li key={step.id} aria-current={state === "now" ? "step" : undefined}>
              <div className="flex items-center gap-3">
                <StepMark number={step.number} state={state} />
                <span className="text-body-strong text-fg">
                  <span className="sr-only">
                    Step {step.number} of {steps.length}, {stepStateWords[state]}.{" "}
                  </span>
                  {stepTitle(step)}
                </span>
              </div>
              {state === "now" ? (
                <p className="pl-9 pt-1 text-body text-fg-muted">Continue on a computer.</p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
