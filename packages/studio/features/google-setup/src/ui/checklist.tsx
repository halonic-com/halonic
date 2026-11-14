import { isProjectId, type SetupEdit, type SetupStep, type StepId } from "@halonicjs/google-setup";
import { Button, Callout, type CalloutHandle } from "@halonicjs/studio-kit";
import { type ReactNode, type Ref, useEffect, useId, useRef, useState } from "react";
import type { GoogleSetupAccount } from "../api.ts";
import { connectorProblem } from "../connector-problem.ts";
import { stepTitle } from "../step-names.ts";
import { failureLine } from "./failure-line.ts";
import { ProblemBanner } from "./problem-banner.tsx";
import { StepBody } from "./step-body.tsx";
import { StepMark, type StepState, stepStateWords } from "./step-mark.tsx";
import { foldedValue, stepWhy } from "./step-text.ts";

/** Props for {@link Checklist}. */
export interface ChecklistProps {
  readonly account: GoogleSetupAccount;
  /** The generated steps, in order. The count and the order come from here alone. */
  readonly steps: readonly SetupStep[];
  readonly answering: boolean;
  /** Saves one change to the setup record. It rejects when it can't be saved. */
  readonly onEdit: (edit: SetupEdit) => Promise<void>;
  /** **Not now**: closes the item. */
  readonly close: () => void;
}

/** The first step not marked done, or the last when every step is. None when there are no steps. */
export function currentStep(
  account: GoogleSetupAccount,
  steps: readonly SetupStep[],
): SetupStep | undefined {
  const next = steps.find((step) => account.record.stepsDone[step.id] === undefined);
  return next ?? steps[steps.length - 1];
}

function stateOf(step: SetupStep, current: SetupStep, done: boolean): StepState {
  if (step.id === current.id) return "now";
  return done ? "done" : "todo";
}

/** What **Done, next** ticks. Steps 5 to 7 tick themselves, so they have no button. */
function hasDoneButton(step: SetupStep): boolean {
  return step.doneWhen === "marked-done";
}

/**
 * The vertical checklist: finished steps fold to one line with **Edit**, the open step shows its
 * title, why it is there and **Not now** and **Done, next**, and later steps show only their
 * titles. Each step's title is a heading and takes focus when the step opens.
 */
export function Checklist({ account, steps, answering, onEdit, close }: ChecklistProps) {
  const current = currentStep(account, steps);
  const problem = connectorProblem(account);
  // A step opened with Edit, until **Done, next** goes on to the current one. An account Google
  // refused opens at the first step it needs again.
  const [editing, setEditing] = useState<StepId | null>(
    () => steps.find((step) => problem?.reopenAt.includes(step.id))?.id ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  // What **Try again** runs: the save that failed.
  const retry = useRef<() => void>(() => {});
  // The project ID as typed in step 1, until it is saved with **Done, next**.
  const [typedProjectId, setTypedProjectId] = useState<string | null>(null);
  const [projectIdError, setProjectIdError] = useState<string | null>(null);
  const open = steps.find((step) => step.id === editing) ?? current;
  const openId = open?.id;
  const titles = useRef(new Map<StepId, HTMLHeadingElement>());

  // Focus goes to the title of the step that opens, also when the item first opens. An error
  // belongs to the step it was shown in, so it goes when another step opens.
  useEffect(() => {
    setFailed(undefined);
    setProjectIdError(null);
    if (openId !== undefined) titles.current.get(openId)?.focus({ preventScroll: true });
  }, [openId]);

  if (current === undefined || open === undefined) return null;

  async function doneNext() {
    if (!answering || busy || open === undefined) return;
    if (needsTick(open, account)) return;
    const projectId = open.id === "project" ? projectIdToSave() : undefined;
    if (projectId === "invalid") return;
    setBusy(true);
    setFailed(undefined);
    try {
      if (projectId !== undefined) await onEdit({ kind: "project-id", projectId });
      await onEdit({ kind: "step-done", step: open.id });
      setTypedProjectId(null);
      setEditing(null);
    } catch (error) {
      setFailed(failureLine("save your progress", error));
      retry.current = () => void doneNext();
    } finally {
      setBusy(false);
    }
  }

  /**
   * The project ID to save with step 1: none when it is unchanged, `null` when it was cleared,
   * and "invalid" (with the error shown) when it isn't a Google project ID.
   */
  function projectIdToSave(): string | null | undefined | "invalid" {
    const typed = (typedProjectId ?? "").trim();
    if (typedProjectId === null || typed === (account.record.projectId ?? "")) return undefined;
    if (typed === "") return null;
    if (isProjectId(typed)) return typed;
    setProjectIdError(
      "A project ID has 6 to 30 lower-case letters, digits and hyphens, and starts with a letter.",
    );
    return "invalid";
  }

  return (
    <>
      {problem === undefined ? null : (
        <ProblemBanner problem={problem} onAction={() => setEditing(problem.actionStep)} />
      )}
      <ol className="flex flex-col gap-3">
        {steps.map((step) => {
          const done = account.record.stepsDone[step.id] !== undefined;
          const isOpen = step.id === open.id;
          return (
            <StepRow
              key={step.id}
              step={step}
              count={steps.length}
              state={stateOf(step, current, done)}
              isCurrent={step.id === current.id}
              folded={done && !isOpen}
              value={foldedValue(step, account)}
              titleRef={(heading) => {
                if (heading === null) titles.current.delete(step.id);
                else titles.current.set(step.id, heading);
              }}
              onEdit={() => setEditing(step.id)}
            >
              {isOpen ? (
                <OpenStep
                  step={step}
                  account={account}
                  projectId={typedProjectId ?? account.record.projectId ?? ""}
                  projectIdError={projectIdError}
                  onProjectId={(text) => {
                    setTypedProjectId(text);
                    setProjectIdError(null);
                  }}
                  onInProduction={function tick(ticked: boolean) {
                    onEdit({ kind: "in-production", ticked }).catch((error: unknown) => {
                      setFailed(failureLine("save your progress", error));
                      retry.current = () => tick(ticked);
                    });
                  }}
                  onEditProject={() => setEditing("project")}
                  answering={answering}
                  busy={busy}
                  failed={failed}
                  onRetry={() => retry.current()}
                  onDone={() => void doneNext()}
                  close={close}
                />
              ) : null}
            </StepRow>
          );
        })}
      </ol>
    </>
  );
}

interface StepRowProps {
  readonly step: SetupStep;
  readonly count: number;
  readonly state: StepState;
  readonly isCurrent: boolean;
  /** Finished and not open: one line with its value and **Edit**. */
  readonly folded: boolean;
  readonly value: string;
  readonly titleRef: Ref<HTMLHeadingElement>;
  readonly onEdit: () => void;
  readonly children: ReactNode;
}

/** One step: its mark and title (a heading), then what the step shows while it is open. */
function StepRow(props: StepRowProps) {
  const { step, count, state, isCurrent, folded, value, titleRef, onEdit, children } = props;
  return (
    <li aria-current={isCurrent ? "step" : undefined}>
      <div className="flex items-center gap-3">
        <StepMark number={step.number} state={state} />
        <h3 ref={titleRef} tabIndex={-1} className="focus-ring text-body-strong text-fg">
          <span className="sr-only">
            Step {step.number} of {count}, {stepStateWords[state]}.{" "}
          </span>
          {stepTitle(step)}
        </h3>
        {folded && value !== "" ? (
          <span className="min-w-0 flex-1 truncate text-body text-fg-muted">{value}</span>
        ) : null}
        {folded ? (
          <Button variant="ghost" size="sm" onClick={onEdit}>
            Edit
          </Button>
        ) : null}
      </div>
      {children}
    </li>
  );
}

/** Whether the step needs a tick the account doesn't have yet: "In production". */
function needsTick(step: SetupStep, account: GoogleSetupAccount): boolean {
  return (
    step.requiredTicks.includes("in-production") && account.record.inProductionTickedAt === null
  );
}

interface OpenStepProps {
  readonly step: SetupStep;
  readonly account: GoogleSetupAccount;
  readonly projectId: string;
  readonly projectIdError: string | null;
  readonly onProjectId: (text: string) => void;
  readonly onInProduction: (ticked: boolean) => void;
  readonly onEditProject: () => void;
  readonly answering: boolean;
  readonly busy: boolean;
  /** The reason the last save failed, as a sentence. */
  readonly failed: string | undefined;
  readonly onRetry: () => void;
  readonly onDone: () => void;
  readonly close: () => void;
}

/** What an open step shows under its title: why, **Not now** and **Done, next**. */
function OpenStep(props: OpenStepProps) {
  const { step, account, answering, busy, failed, onRetry, onDone, close } = props;
  const reason = useId();
  const callout = useRef<CalloutHandle>(null);
  // A failure that appears because of what you did takes focus, so a screen reader reads it.
  useEffect(() => {
    if (failed !== undefined) callout.current?.focus();
  }, [failed]);
  const tickMissing = needsTick(step, account);
  const unavailableText = answering
    ? "Tick 'In production' to go on."
    : "The engine isn't answering.";
  return (
    <div className="flex flex-col gap-3 pl-9 pt-2">
      <p className="text-body">{stepWhy(step)}</p>
      <StepBody
        step={step}
        accountType={account.record.accountType}
        inProduction={account.record.inProductionTickedAt !== null}
        projectId={props.projectId}
        projectIdError={props.projectIdError}
        answering={answering}
        serviceName={(id) => account.services.find((service) => service.id === id)?.label ?? id}
        onProjectId={props.onProjectId}
        onInProduction={props.onInProduction}
        onEditProject={props.onEditProject}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={close}>
          Not now
        </Button>
        {hasDoneButton(step) ? (
          <Button
            variant="primary"
            busy={busy}
            unavailable={answering && !tickMissing ? undefined : { reason }}
            onClick={onDone}
          >
            Done, next
          </Button>
        ) : null}
      </div>
      {(answering && !tickMissing) || !hasDoneButton(step) ? null : (
        <p id={reason} className="text-small text-fg-muted">
          {unavailableText}
        </p>
      )}
      {failed === undefined ? null : (
        <Callout
          tone="danger"
          announce="focus"
          ref={callout}
          action={{ label: "Try again", onClick: onRetry }}
        >
          {failed}
        </Callout>
      )}
    </div>
  );
}
