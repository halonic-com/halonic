import { Button, Callout, type CalloutTone } from "@halonicjs/studio-kit";
import { type RefObject, useEffect, useId, useRef, useState } from "react";
import {
  canDecline,
  type StepperActions,
  type StepperStage,
  type StepperView,
} from "../stepper-view.ts";
import { ManualGuide } from "./manual-guide.tsx";
import { IrreversibleWarnings, RequestCalls, RequestFacts } from "./request-review.tsx";
import { RunBar } from "./run-bar.tsx";
import { MissingPermission, SignInPanel } from "./sign-in-panel.tsx";
import { StepList } from "./step-list.tsx";
import { findTarget, focusLost, focusTarget, resultText } from "./stepper-changes.ts";
import { runWords, serviceDownText, stageText } from "./stepper-words.ts";

/** Props for {@link ActionStepper}. */
export interface ActionStepperProps {
  readonly view: StepperView;
  readonly actions: StepperActions;
  /** Whether its title takes the focus when it opens: in an Inbox bundle, only the first card's does. */
  readonly focusOnOpen?: boolean | undefined;
}

/** The colour of a stage's line: a finished run is good news, the rest only say why nothing runs. */
const stageTones: Partial<Record<StepperStage["kind"], CalloutTone>> = {
  expired: "attention",
  "not-available": "attention",
  blocked: "attention",
};

/** The newest result for the status region, counted so the same words are read again. */
interface Said {
  readonly text: string;
  readonly count: number;
}

/**
 * Follows each new view (`action-steppers.results`): writes what changed into the status region,
 * and when the pressed control went away with the change, moves focus to where the user goes on.
 * The first view says nothing and leaves focus on the title.
 */
function useFollowChanges(
  view: StepperView,
  stepper: RefObject<HTMLElement | null>,
  heading: RefObject<HTMLHeadingElement | null>,
): Said {
  const [said, setSaid] = useState<Said>({ text: "", count: 0 });
  const shown = useRef(view);
  useEffect(() => {
    const before = shown.current;
    shown.current = view;
    if (before === view) return;
    const text = resultText(before, view);
    if (text !== null) setSaid((previous) => ({ text, count: previous.count + 1 }));
    if (!focusLost() || stepper.current === null) return;
    const target = findTarget(stepper.current, focusTarget(before, view)) ?? heading.current;
    target?.focus({ preventScroll: true });
  }, [view, stepper, heading]);
  return said;
}

/**
 * One action request, from review to result (`action-steppers.review`, `.sign-in`, `.run`,
 * `.browser`, `.by-hand`, `.end`, `.results`), drawn from its {@link StepperView} in the Inbox's
 * one content panel. It holds no rules of its own beyond the confirmation it asks for: the view
 * model says what stage the request is in, and every button calls one of `actions`. Opening it
 * focuses the title, never a button, unless `focusOnOpen` is off because a card above it in a
 * bundle has the focus. Every result is said through one status region, which is there from the
 * start because a region that appears already holding its words is often not read.
 */
export function ActionStepper({ view, actions, focusOnOpen = true }: ActionStepperProps) {
  const titleId = useId();
  // The running step's "Running…" line: the reason every button that waits for it points at.
  const runningId = useId();
  const stepper = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusOnOpen) heading.current?.focus({ preventScroll: true });
  }, [focusOnOpen]);
  const said = useFollowChanges(view, stepper, heading);
  const stage = view.stage;
  const line = stageText(stage);

  return (
    <section ref={stepper} aria-labelledby={titleId} className="flex min-h-0 flex-col">
      <p role="status" aria-atomic="true" className="sr-only">
        {/* A new key for each result, so the same words are read again. */}
        <span key={said.count}>{said.text}</span>
      </p>
      <div className="flex flex-col gap-4 overflow-y-auto p-4">
        <h2
          id={titleId}
          ref={heading}
          tabIndex={-1}
          className="focus-ring text-title text-fg wrap-break-word"
        >
          {view.title}
        </h2>
        {/* Right under the title, so a closed request says so before anything has to scroll. */}
        {line === null ? null : <Callout tone={stageTones[stage.kind] ?? "info"}>{line}</Callout>}
        <RequestFacts view={view} />
        <IrreversibleWarnings view={view} />
        {stage.kind === "sign-in" ? (
          <SignInPanel signIn={stage.signIn} start={actions.signIn} />
        ) : null}
        {stage.kind === "missing-permission" ? (
          <MissingPermission
            service={view.service}
            account={view.account}
            permission={stage.permission}
            signInAgain={actions.signInAgain}
          />
        ) : null}
        {stage.kind === "ready" && view.serviceDown ? (
          <Callout tone="attention">{serviceDownText(view.service)}</Callout>
        ) : null}
        <StepList
          view={view}
          actions={actions}
          active={stage.kind === "ready"}
          reviewOnly={stage.kind === "desktop-only"}
          runningId={runningId}
        />
        <RequestCalls steps={view.steps} />
        {stage.kind === "ready" ? <ManualGuide view={view} actions={actions} /> : null}
      </div>
      {stage.kind === "ready" ? (
        <RunBar view={view} actions={actions} runningId={runningId} />
      ) : null}
      {stage.kind !== "ready" && canDecline(stage) ? (
        <div className="border-t border-border p-4">
          <Button variant="secondary" onClick={actions.decline}>
            {runWords.decline}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
