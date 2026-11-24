import {
  type ChangeMarkKind,
  changeMarkKindOf,
  changeMarkSelector,
  ItemChangeMark,
  type ItemChangeToReview,
  type ItemReviewMarks,
  type ItemReviewState,
  useItemReview,
} from "@halonicjs/studio-shell";
import { createContext, type RefObject, useContext, useMemo, useRef } from "react";
import { flushSync } from "react-dom";
import type { WorkflowRef, WorkflowsHost, WorkflowView } from "../api.ts";
import type { Load } from "../page/use-load.ts";
import type { WorkflowReviewHost } from "../review-api.ts";

/** What the workflow page's marks read and decide: the shell's marks, and the steps on the canvas. */
export interface WorkflowReviewMarks extends ItemReviewMarks {
  readonly stepIds: readonly string[];
}

/** The workflow page's changes to review, for the canvas's steps and the marks above it. */
export const WorkflowReviewContext = createContext<WorkflowReviewMarks | null>(null);

/** What {@link useWorkflowReview} needs. */
export interface WorkflowReviewParts {
  readonly host: WorkflowsHost;
  /** The app's changes to review; without it the page has no bar and no marks. */
  readonly review: WorkflowReviewHost | undefined;
  readonly workflow: WorkflowRef;
  readonly name: string;
  /** The workflow as read, for the steps on its canvas: no bar until it is read. */
  readonly load: Load<WorkflowView>;
  /** Shows Flow with the step picked, or with none picked for a change that isn't at a step. */
  readonly showStep: (stepId: string | undefined) => void;
  /** Where the page draws its marks, so Previous and Next can focus one. */
  readonly page: RefObject<HTMLElement | null>;
  /** Opens a file at a line, for Compare: Files offers it there (review panel note 4). */
  readonly openFileAt?: ((path: string, line: number) => void) | undefined;
  readonly announce?: ((text: string) => void) | undefined;
}

/** The workflow page's changes to review, from {@link useWorkflowReview}. */
export interface WorkflowReviewState extends Pick<ItemReviewState, "bar"> {
  /** For {@link WorkflowReviewContext}; `null` without changes to review. */
  readonly marks: WorkflowReviewMarks | null;
  /** The page's host for its edits: each one tells the review first (review panel note 2). */
  readonly host: WorkflowsHost;
}

/**
 * The assistant's changes to the workflow (AI changes 1.2 and 1.3): the item bar, the marks at its
 * steps and the others above the canvas. Previous and Next pick the change's step on the canvas
 * and move the focus to its mark.
 */
export function useWorkflowReview(parts: WorkflowReviewParts): WorkflowReviewState {
  const { host, load, showStep, page, openFileAt } = parts;
  const view = load.kind === "ready" ? load.value : undefined;
  const stepIds = useMemo(() => view?.steps.map((step) => step.id) ?? [], [view]);
  const changes = useItemReview({
    host: parts.review,
    item: parts.workflow,
    name: parts.name,
    openFile: openFileAt && ((path) => openFileAt(path, 1)),
    announce: parts.announce,
    goTo: (change) => {
      flushSync(() => showStep(stepOfChange(change, stepIds)));
      page.current?.querySelector<HTMLElement>(changeMarkSelector(change.id))?.focus();
    },
  });
  // The newest `editing`, so the host the page edits through stays the same one.
  const editing = useRef(changes.editing);
  editing.current = changes.editing;
  const edited = useMemo(() => editingHost(host, () => editing.current()), [host]);
  const marks = changes.marks && { ...changes.marks, stepIds };
  return { bar: view === undefined ? null : changes.bar, marks, host: edited };
}

/** The step on the canvas a change is marked at: the first step its parts cover that is there. */
export function stepOfChange(
  change: ItemChangeToReview,
  stepIds: readonly string[],
): string | undefined {
  for (const [field, stepId] of change.parts) {
    const atStep = field === "states" || field === "layout";
    if (atStep && stepId !== undefined && stepIds.includes(stepId)) return stepId;
  }
  return undefined;
}

/** How the assistant changed a step on the canvas, for its card's edge; `undefined` if it didn't. */
export function useStepChange(stepId: string): ChangeMarkKind | undefined {
  const marks = useContext(WorkflowReviewContext);
  if (marks === null || marks.review.whole) return undefined;
  const change = marks.review.changes.find((one) => stepOfChange(one, marks.stepIds) === stepId);
  return change === undefined ? undefined : changeMarkKindOf(marks.review, change);
}

/**
 * The marks above the canvas: the picked step's, and those of the changes no step on the canvas
 * shows, such as a workflow field, a removed step or a change to the whole file.
 */
export function ReviewMarksBand({ picked }: { readonly picked: string | undefined }) {
  const marks = useContext(WorkflowReviewContext);
  if (marks === null) return null;
  const shown = marks.review.changes.filter((change) => {
    const step = marks.review.whole ? undefined : stepOfChange(change, marks.stepIds);
    return step === undefined || step === picked;
  });
  if (shown.length === 0) return null;
  return (
    <div className="flex flex-col gap-3 border-b border-border px-6 py-3">
      {shown.map((change) => (
        <ItemChangeMark key={change.id} marks={marks} change={change} />
      ))}
    </div>
  );
}

/** The host methods that write the workflow's file: the person's edits. */
const edits: ReadonlySet<PropertyKey> = new Set<keyof WorkflowsHost>([
  "addStep",
  "resetLayout",
  "rename",
  "changeStep",
  "changeArrows",
  "removeStep",
  "removeArrow",
]);

/**
 * The host, with `editing` called before each edit is written, so the review knows a change that
 * goes then was accepted by the edit (note 2). A proxy keeps the host's own `this` for each call.
 */
function editingHost(host: WorkflowsHost, editing: () => void): WorkflowsHost {
  return new Proxy(host, {
    get(target, key) {
      const value: unknown = Reflect.get(target, key, target);
      if (typeof value !== "function") return value;
      if (!edits.has(key)) return value.bind(target);
      return (...args: unknown[]) => {
        editing();
        return value.apply(target, args);
      };
    },
  });
}
