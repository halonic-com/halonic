import { useToastStore } from "@halonicjs/studio-kit";
import { errorReasonFor } from "@halonicjs/studio-shell";
import type { WorkflowRef, WorkflowsHost } from "../api.ts";
import { pageWords } from "./page-words.ts";
import type { CanvasEdit } from "./workflow-canvas.tsx";

/**
 * How the canvas's toolbar and its cards' ports change the workflow through the host, saying why
 * on a toast when it can't. `undefined` where the host can't add steps, and on a phone, whose Flow is view-only.
 */
export function useCanvasEdit(
  host: WorkflowsHost,
  ref: WorkflowRef,
  name: string,
  phone: boolean,
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
    addStep: (type, at) =>
      addStep.call(host, ref, type, at).catch((error: unknown) => {
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
            announce?.(pageWords.arrows.added(from, to));
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
