import { type ToastStore, useToastStore } from "@halonicjs/studio-kit";
import { errorReasonFor } from "@halonicjs/studio-shell";
import type { WorkflowArrow, WorkflowRef, WorkflowRemoval, WorkflowsHost } from "../api.ts";
import { pageWords } from "./page-words.ts";

const words = pageWords.removed;

/** How the docked step card removes its step or one of its arrows. */
export interface Removing {
  /** Removes the step; resolves to whether it went. */
  readonly step: (stepId: string) => Promise<boolean>;
  /** Removes the step's arrow at `index` (in file order), which is `arrow`; resolves to whether it went. */
  readonly arrow: (stepId: string, index: number, arrow: WorkflowArrow) => Promise<boolean>;
}

/**
 * How the page removes a step or an arrow (flow-workflows 4.6, UX checklist 10.10): at once, with
 * no confirm, then a toast that says what went, with **Undo** for 10 s; the toast is all that is
 * said. When the host can't, a danger toast says why. `undefined` where the host can't remove.
 */
export function useRemoving(
  host: WorkflowsHost,
  ref: WorkflowRef | undefined,
): Removing | undefined {
  const toasts = useToastStore();
  const { removeStep, removeArrow } = host;
  if (removeStep === undefined || removeArrow === undefined || ref === undefined) return undefined;
  const refused = (stepId: string, error: unknown) =>
    toasts?.show({
      tone: "danger",
      title: pageWords.stepCard.couldntSave(stepId),
      text: errorReasonFor(error),
    });
  return {
    step: async (stepId) => {
      try {
        const removed = await removeStep.call(host, ref, stepId);
        removedToast(toasts, words.step(stepId, removed.arrows), removed, () =>
          words.couldntPutBackStep(stepId),
        );
        return true;
      } catch (error) {
        refused(stepId, error);
        return false;
      }
    },
    arrow: async (stepId, index, arrow) => {
      try {
        const removed = await removeArrow.call(host, ref, stepId, index);
        removedToast(toasts, words.arrow(stepId, arrow.to), removed, () =>
          words.couldntPutBackArrow(stepId, arrow.to),
        );
        return true;
      } catch (error) {
        refused(stepId, error);
        return false;
      }
    },
  };
}

/** The toast that says what went, whose **Undo** puts it back or says why it can't. */
function removedToast(
  toasts: ToastStore | null,
  title: string,
  removal: WorkflowRemoval,
  couldntPutBack: () => string,
): void {
  const putBack = async () => {
    try {
      await removal.undo();
    } catch (error) {
      toasts?.show({ tone: "danger", title: couldntPutBack(), text: errorReasonFor(error) });
    }
  };
  toasts?.show({
    tone: "success",
    title,
    action: { label: words.undo, onClick: () => void putBack() },
  });
}
