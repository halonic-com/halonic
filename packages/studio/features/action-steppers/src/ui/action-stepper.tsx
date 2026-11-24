import { Button, Callout, type CalloutTone } from "@halonicjs/studio-kit";
import { useEffect, useId, useRef } from "react";
import {
  canDecline,
  type StepperActions,
  type StepperStage,
  type StepperView,
} from "../stepper-view.ts";
import { RequestCalls, RequestFacts } from "./request-review.tsx";
import { RunBar } from "./run-bar.tsx";
import { MissingPermission, SignInPanel } from "./sign-in-panel.tsx";
import { StepList } from "./step-list.tsx";
import { runWords, stageText } from "./stepper-words.ts";

/** Props for {@link ActionStepper}. */
export interface ActionStepperProps {
  readonly view: StepperView;
  readonly actions: StepperActions;
}

/** The colour of a stage's line: a finished run is good news, the rest only say why nothing runs. */
const stageTones: Partial<Record<StepperStage["kind"], CalloutTone>> = {
  expired: "attention",
  "not-available": "attention",
};

/**
 * One action request, from review to result (`action-steppers.review`, `.sign-in`, `.run`,
 * `.end`), drawn from its {@link StepperView} in the Inbox's one content panel. It holds no rules
 * of its own beyond the confirmation it asks for: the view model says what stage the request is
 * in, and every button calls one of `actions`. Opening it focuses the title, never a button.
 */
export function ActionStepper({ view, actions }: ActionStepperProps) {
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  const stage = view.stage;
  const line = stageText(stage);

  return (
    <section aria-labelledby={titleId} className="flex min-h-0 flex-col">
      <div className="flex flex-col gap-4 overflow-y-auto p-4">
        <h2
          id={titleId}
          ref={heading}
          tabIndex={-1}
          className="focus-ring text-title text-fg wrap-break-word"
        >
          {view.title}
        </h2>
        <RequestFacts view={view} />
        {stage.kind === "sign-in" ? (
          <SignInPanel signIn={stage.signIn} saveToken={actions.saveToken} />
        ) : null}
        {stage.kind === "missing-permission" ? (
          <MissingPermission
            service={view.service}
            account={view.account}
            permission={stage.permission}
            signInAgain={actions.signInAgain}
          />
        ) : null}
        <StepList steps={view.steps} service={view.service} />
        <RequestCalls steps={view.steps} />
        {line === null ? null : (
          <Callout tone={stageTones[stage.kind] ?? "info"} announce="polite">
            {line}
          </Callout>
        )}
      </div>
      {stage.kind === "ready" ? <RunBar view={view} actions={actions} /> : null}
      {stage.kind !== "ready" && canDecline(stage) ? (
        <div className="border-t border-border p-4">
          <Button variant="ghost" onClick={actions.decline}>
            {runWords.decline}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
