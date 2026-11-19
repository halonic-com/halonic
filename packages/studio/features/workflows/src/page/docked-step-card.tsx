import { findSecretShape } from "@halonicjs/std";
import {
  Button,
  CloseIcon,
  Field,
  Input,
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
import { type KeyboardEvent, useCallback } from "react";
import type { WorkflowStep, WorkflowStepChange, WorkflowStepType, WorkflowsHost } from "../api.ts";
import { pageWords } from "./page-words.ts";
import type { Dock } from "./run-dock.tsx";
import type { WorkflowLoad } from "./use-workflow.ts";

const words = pageWords.stepCard;

/** Props for {@link DockedStepCard}. */
export interface DockedStepCardProps {
  readonly step: WorkflowStep;
  /** The workflow's name, for the breadcrumb. */
  readonly workflowName: string;
  /** Saves one change of the step; resolves to whether it was written. */
  readonly save: (change: WorkflowStepChange) => Promise<boolean>;
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

/** Save model 8.4: a key pasted into a field is not saved. */
const keyCheck = (text: string): string | null =>
  findSecretShape(text) === undefined ? null : words.looksLikeKey;

const noCheck = (): null => null;

/**
 * The card docked at the right that edits a picked step (`workflows.page.step-card`, flow-workflows
 * 5.1 and 5.2): the breadcrumb, "Step triage" as its title, then the fields the step's kind has.
 * Each field saves by itself, after a pause in typing and when it is left; a field with a mistake
 * isn't saved. The canvas beside it stays usable and undimmed.
 */
export function DockedStepCard({
  step,
  workflowName,
  save,
  reportNotSaved,
  onClose,
}: DockedStepCardProps) {
  const description = useAutoSaved(
    step.description ?? "",
    (next) => save({ description: next }),
    keyCheck,
  );
  const prompt = useAutoSaved(step.prompt ?? "", (next) => save({ prompt: next }), keyCheck);
  const output = useAutoSaved(step.output ?? "", (next) => save({ output: next }), noCheck);
  const hasPrompt = step.type === "task" && step.promptIsData !== true;
  const hasOutput = writesOutput.has(step.type);
  useReportNotSaved(reportNotSaved, [
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
          {hasPrompt && (
            <Field
              label={words.prompt}
              hint={prompt.value === "" ? words.promptEmpty : undefined}
              error={prompt.error}
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
            >
              <Input
                value={output.value}
                onChange={(event) => output.onChange(event.target.value)}
                onBlur={output.flush}
              />
            </Field>
          )}
          <Field label={words.description} error={description.error}>
            <TextArea
              minRows={2}
              maxRows={8}
              value={description.value}
              onChange={(event) => description.onChange(event.target.value)}
              onBlur={description.flush}
            />
          </Field>
        </div>
      </SidePanel>
    </div>
  );
}

/**
 * How the page saves a step from its card: through the host, saying why on a toast when it
 * can't. Resolves to whether it was written, so the field keeps what wasn't.
 */
export function useSaveStep(
  changeStep: ((stepId: string, change: WorkflowStepChange) => Promise<void>) | undefined,
  stepId: string | undefined,
): ((change: WorkflowStepChange) => Promise<boolean>) | undefined {
  const toasts = useToastStore();
  const save = useCallback(
    async (change: WorkflowStepChange) => {
      if (changeStep === undefined || stepId === undefined) return false;
      try {
        await changeStep(stepId, change);
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
    [changeStep, stepId, toasts],
  );
  return changeStep === undefined || stepId === undefined ? undefined : save;
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
  readonly onClose: () => void;
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
  onClose,
}: StepEditDockProps) {
  const view = workflow.kind === "ready" ? workflow.value : undefined;
  const { changeStep } = host;
  const save = useSaveStep(
    changeStep && view && ((stepId, change) => changeStep.call(host, view, stepId, change)),
    pickedStep,
  );
  const key = view === undefined ? "" : `workflow/${view.hubId}/${view.id}/step`;
  const reportNotSaved = useCallback(
    (count: number) => saving?.setFieldsNotSaved({ key, title: view?.name ?? "" }, count),
    [saving, key, view?.name],
  );
  const step = view?.steps.find((one) => one.id === pickedStep);
  if (
    dock !== undefined ||
    runShown ||
    phone ||
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
      save={save}
      reportNotSaved={reportNotSaved}
      onClose={onClose}
    />
  );
}
