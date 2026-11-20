import {
  Button,
  CloseIcon,
  Field,
  Input,
  Select,
  type SelectOption,
  SidePanel,
  TextArea,
  useToastStore,
} from "@halonicjs/studio-kit";
import {
  errorReasonFor,
  type SaveState,
  useAutoSaved,
  useReportNotSaved,
} from "@halonicjs/studio-shell";
import { type KeyboardEvent, useCallback, useState } from "react";
import type {
  WorkflowAgentChoice,
  WorkflowArrow,
  WorkflowArrowChange,
  WorkflowStep,
  WorkflowStepChange,
  WorkflowStepType,
  WorkflowsHost,
} from "../api.ts";
import { keyCheck, noCheck, pickNow } from "./field-saving.ts";
import { pageWords } from "./page-words.ts";
import type { Dock } from "./run-dock.tsx";
import { ArrowsIn, StepArrows } from "./step-arrows.tsx";
import type { WorkflowLoad } from "./use-workflow.ts";

const words = pageWords.stepCard;

/** Props for {@link DockedStepCard}. */
export interface DockedStepCardProps {
  readonly step: WorkflowStep;
  /** The workflow's name, for the breadcrumb. */
  readonly workflowName: string;
  /** The agents of the workflow's hub, for the Agent picker. */
  readonly agents: readonly WorkflowAgentChoice[];
  /** Saves one change of the step; resolves to whether it was written. */
  readonly save: (change: WorkflowStepChange) => Promise<boolean>;
  /** Every step of the workflow, in the file's order, which the step's arrows can go to. */
  readonly stepIds: readonly string[];
  /** The workflow's arrows: the step's own, and those into it for **Arrows in**. */
  readonly arrows: readonly WorkflowArrow[];
  /** Adds, moves or changes one of the step's arrows; resolves to whether it was written. Absent: no arrows section. */
  readonly changeArrows?: ((change: WorkflowArrowChange) => Promise<boolean>) | undefined;
  /** Opens another step's card, from **Arrows in**. */
  readonly onOpenStep: (stepId: string) => void;
  readonly announce?: ((line: string) => void) | undefined;
  /** Hears how many of its fields aren't saved, for the toolbar's "1 field not saved". */
  readonly reportNotSaved?: ((count: number) => void) | undefined;
  /** ✕ and Escape. Focus goes back to the step's card on the canvas. */
  readonly onClose: () => void;
}

/** The kinds whose output later steps can pick (`output`): the ones that run something. */
const writesOutput: ReadonlySet<WorkflowStepType> = new Set([
  "task",
  "workflow",
  "parallel",
  "foreach",
]);

/** The kinds that run an agent, and so have **Agent**; a parallel step's branches name their own. */
const runsAgent: ReadonlySet<WorkflowStepType> = new Set(["task", "foreach"]);

/** The Type picker's six kinds, in the order flow-workflows 5.2 lists them. */
const typeOptions: readonly SelectOption[] = Object.entries(words.types).map(([value, label]) => ({
  value,
  label,
}));

/**
 * The Agent picker: "No agent" first, then the hub's agents. An agent the file names that the hub
 * doesn't have stays in the list by its id, so it isn't lost; the canvas says it's missing.
 */
function agentOptions(
  agents: readonly WorkflowAgentChoice[],
  picked: string,
): readonly SelectOption[] {
  const options = [
    { value: "", label: pageWords.noAgent },
    ...agents.map((one) => ({ value: one.id, label: one.name })),
  ];
  if (picked !== "" && !agents.some((one) => one.id === picked)) {
    options.push({ value: picked, label: picked });
  }
  return options;
}

/** The steps with an arrow to `stepId`, each once, for **Arrows in**; a step's arrow to itself isn't a way in. */
function stepsInto(stepId: string, arrows: readonly WorkflowArrow[]): readonly string[] {
  const from = arrows.filter((arrow) => arrow.to === stepId && arrow.from !== stepId);
  return [...new Set(from.map((arrow) => arrow.from))];
}

/**
 * The card docked at the right that edits a picked step (`workflows.page.step-card`, flow-workflows
 * 5.1 and 5.2): the breadcrumb, "Step triage" as its title, then the fields the step's kind has.
 * Each field saves by itself, after a pause in typing and when it is left; a field with a mistake
 * isn't saved. The canvas beside it stays usable and undimmed.
 */
export function DockedStepCard({
  step,
  workflowName,
  agents,
  save,
  stepIds,
  arrows,
  changeArrows,
  onOpenStep,
  announce,
  reportNotSaved,
  onClose,
}: DockedStepCardProps) {
  // A pick is a finished edit, so the pickers save at once; they are auto-saved fields still, so a
  // pick that couldn't be written stays shown and counts as not saved.
  const type = useAutoSaved(step.type, (next) => save({ type: next as WorkflowStepType }), noCheck);
  const agent = useAutoSaved(step.agent ?? "", (next) => save({ agent: next }), noCheck);
  const description = useAutoSaved(
    step.description ?? "",
    (next) => save({ description: next }),
    keyCheck,
  );
  const prompt = useAutoSaved(step.prompt ?? "", (next) => save({ prompt: next }), keyCheck);
  const output = useAutoSaved(step.output ?? "", (next) => save({ output: next }), noCheck);
  // The fields follow the kind picked, so they change with the pick and not after the save.
  const kind = type.value as WorkflowStepType;
  const hasAgent = runsAgent.has(kind);
  // A prompt does nothing without an agent, so it shows only once one is picked. Its text stays in
  // the file, as with a change of kind, so picking an agent again brings it back.
  const hasPrompt = kind === "task" && agent.value !== "" && step.promptIsData !== true;
  const hasOutput = writesOutput.has(kind);
  // The expanded arrow's fields count with the card's own.
  const [arrowFieldsNotSaved, setArrowFieldsNotSaved] = useState(0);
  const reportCard = useCallback(
    (count: number) => reportNotSaved?.(count + arrowFieldsNotSaved),
    [reportNotSaved, arrowFieldsNotSaved],
  );
  useReportNotSaved(reportCard, [
    type,
    ...(hasAgent ? [agent] : []),
    description,
    ...(hasPrompt ? [prompt] : []),
    ...(hasOutput ? [output] : []),
  ]);
  // Escape while focus is in the card; the shell's close stack isn't open to features.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && !event.defaultPrevented) onClose();
  };
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Escape from any field in the card closes it.
    <div onKeyDown={onKeyDown} className="w-panel max-w-full shrink-0 shadow-2">
      <SidePanel
        title={words.title(step.id)}
        onClose={onClose}
        actions={
          <Button
            variant="ghost"
            size="sm"
            icon={<CloseIcon />}
            label={words.close}
            onClick={onClose}
          />
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-caption text-fg-muted">{words.breadcrumb(workflowName, step.id)}</p>
          <Field label={words.type}>
            <Select options={typeOptions} value={type.value} onChange={pickNow(type)} />
          </Field>
          {hasAgent && (
            <Field label={words.agent} hint={agent.value === "" ? words.noAgent : undefined}>
              <Select
                options={agentOptions(agents, agent.value)}
                value={agent.value}
                onChange={pickNow(agent)}
              />
            </Field>
          )}
          {hasPrompt && (
            <Field
              label={words.prompt}
              hint={prompt.value === "" ? words.promptEmpty : undefined}
              error={prompt.error}
              announceWhileFocused
            >
              <TextArea
                minRows={3}
                maxRows={10}
                value={prompt.value}
                onChange={(event) => prompt.onChange(event.target.value)}
                onBlur={prompt.flush}
              />
            </Field>
          )}
          {hasOutput && (
            <Field
              label={words.output}
              hint={output.value.trim() === "" ? undefined : words.outputHint(output.value.trim())}
              error={output.error}
              announceWhileFocused
            >
              <Input
                value={output.value}
                onChange={(event) => output.onChange(event.target.value)}
                onBlur={output.flush}
              />
            </Field>
          )}
          <Field label={words.description} error={description.error} announceWhileFocused>
            <TextArea
              minRows={2}
              maxRows={8}
              value={description.value}
              onChange={(event) => description.onChange(event.target.value)}
              onBlur={description.flush}
            />
          </Field>
          {kind !== "final" && changeArrows !== undefined && (
            <StepArrows
              stepId={step.id}
              arrows={arrows.filter((arrow) => arrow.from === step.id)}
              stepIds={stepIds}
              isWait={kind === "wait"}
              change={changeArrows}
              announce={announce}
              reportNotSaved={setArrowFieldsNotSaved}
            />
          )}
          <ArrowsIn from={stepsInto(step.id, arrows)} onOpen={onOpenStep} />
        </div>
      </SidePanel>
    </div>
  );
}

/**
 * How the page changes a step from its card, its fields or its arrows: through the host, saying
 * why on a toast when it can't. Resolves to whether it was written, so a field keeps what wasn't.
 */
export function useChangeStep<Change>(
  apply: ((stepId: string, change: Change) => Promise<void>) | undefined,
  stepId: string | undefined,
): ((change: Change) => Promise<boolean>) | undefined {
  const toasts = useToastStore();
  const change = useCallback(
    async (one: Change) => {
      if (apply === undefined || stepId === undefined) return false;
      try {
        await apply(stepId, one);
        return true;
      } catch (error) {
        toasts?.show({
          tone: "danger",
          title: words.couldntSave(stepId),
          text: errorReasonFor(error),
        });
        return false;
      }
    },
    [apply, stepId, toasts],
  );
  return apply === undefined || stepId === undefined ? undefined : change;
}

/** Props for {@link StepEditDock}. */
export interface StepEditDockProps {
  readonly host: WorkflowsHost;
  readonly workflow: WorkflowLoad;
  /** The step picked on the canvas; no card while none is. */
  readonly pickedStep: string | undefined;
  /** The start form or a run docked by the page, which this card leaves alone. */
  readonly dock: Dock;
  /** A run is shown on the canvas: a picked step's card then says what happened in the run. */
  readonly runShown: boolean;
  readonly phone: boolean;
  readonly saving: Pick<SaveState, "setFieldsNotSaved"> | undefined;
  /** Opens another step's card, from **Arrows in**. */
  readonly onOpenStep: (stepId: string) => void;
  readonly announce?: ((line: string) => void) | undefined;
  readonly onClose: () => void;
}

/** Whether {@link StepEditDock} shows a card, so the page knows the canvas is narrowed by it. */
export function stepCardDocks({
  host,
  workflow,
  pickedStep,
  dock,
  runShown,
  phone,
}: Pick<
  StepEditDockProps,
  "host" | "workflow" | "pickedStep" | "dock" | "runShown" | "phone"
>): boolean {
  return (
    dock === undefined &&
    !runShown &&
    !phone &&
    host.changeStep !== undefined &&
    workflow.kind === "ready" &&
    workflow.value.steps.some((one) => one.id === pickedStep)
  );
}

/**
 * The docked step card for the step picked on the canvas, where the host can change steps. Not on
 * a phone, whose Flow is view-only, and not while another card is docked.
 */
export function StepEditDock({
  host,
  workflow,
  pickedStep,
  dock,
  runShown,
  phone,
  saving,
  onOpenStep,
  announce,
  onClose,
}: StepEditDockProps) {
  const view = workflow.kind === "ready" ? workflow.value : undefined;
  const { changeStep, changeArrows } = host;
  const save = useChangeStep<WorkflowStepChange>(
    changeStep && view && ((stepId, change) => changeStep.call(host, view, stepId, change)),
    pickedStep,
  );
  const saveArrows = useChangeStep<WorkflowArrowChange>(
    changeArrows && view && ((stepId, change) => changeArrows.call(host, view, stepId, change)),
    pickedStep,
  );
  const key = view === undefined ? "" : `workflow/${view.hubId}/${view.id}/step`;
  const reportNotSaved = useCallback(
    (count: number) => saving?.setFieldsNotSaved({ key, title: view?.name ?? "" }, count),
    [saving, key, view?.name],
  );
  const step = view?.steps.find((one) => one.id === pickedStep);
  if (
    !stepCardDocks({ host, workflow, pickedStep, dock, runShown, phone }) ||
    save === undefined ||
    view === undefined ||
    step === undefined
  )
    return null;
  return (
    <DockedStepCard
      key={step.id}
      step={step}
      workflowName={view.name}
      agents={view.agents ?? []}
      save={save}
      stepIds={view.steps.map((one) => one.id)}
      arrows={view.arrows}
      changeArrows={saveArrows}
      onOpenStep={onOpenStep}
      announce={announce}
      reportNotSaved={reportNotSaved}
      onClose={onClose}
    />
  );
}
