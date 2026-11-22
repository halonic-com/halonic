import { useToastStore } from "@halonicjs/studio-kit";
import { errorReasonFor } from "@halonicjs/studio-shell";
import type { WorkflowRef, WorkflowsHost, WorkflowView } from "../api.ts";
import { arrowAddedLine } from "./arrow-announcements.ts";
import { pageWords } from "./page-words.ts";
import type { CanvasEdit } from "./workflow-canvas.tsx";

/**
 * How the canvas's toolbar and its cards' ports change the workflow through the host, saying why
 * on a toast when it can't. `undefined` where the host can't add steps, and on a phone, whose Flow is view-only.
 * `workflow` is the one the canvas draws, so an arrow added by a drag is announced as the step
 * card's **Add** announces it.
 */
export function useCanvasEdit(
  host: WorkflowsHost,
  ref: WorkflowRef,
  name: string,
  phone: boolean,
  workflow: Pick<WorkflowView, "steps" | "arrows"> | undefined,
  announce?: (line: string) => void,
): CanvasEdit | undefined {
  const toasts = useToastStore();
  const { addStep, resetLayout, changeArrows } = host;
  if (addStep === undefined || resetLayout === undefined || phone) return undefined;
  const failed = (error: unknown) =>
    toasts?.show({
      tone: "danger",
      title: pageWords.toolbar.couldntChange(name),
      text: errorReasonFor(error),
    });
  return {
    addStep: (type, at, from) =>
      addStep.call(host, ref, type, at, from).catch((error: unknown) => {
        failed(error);
        return undefined;
      }),
    autoLayout: () =>
      resetLayout.call(host, ref).then(
        () => true,
        (error: unknown) => {
          failed(error);
          return false;
        },
      ),
    connect:
      changeArrows &&
      ((from, to) =>
        changeArrows.call(host, ref, from, { kind: "add", to }).then(
          () => {
            const steps = workflow?.steps ?? [];
            const arrows = workflow?.arrows.filter((arrow) => arrow.from === from) ?? [];
            announce?.(arrowAddedLine(steps, arrows, from, to));
            return true;
          },
          (error: unknown) => {
            toasts?.show({
              tone: "danger",
              title: pageWords.stepCard.couldntSave(from),
              text: errorReasonFor(error),
            });
            return false;
          },
        )),
  };
}
