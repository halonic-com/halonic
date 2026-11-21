import type { ToastStore } from "@halonicjs/studio-kit";
import { errorReasonFor } from "@halonicjs/studio-shell";
import type { TrashedWorkflow, WorkflowRef, WorkflowsHost } from "../api.ts";
import { deleteWords } from "./delete-words.ts";

/** What the page knows of a workflow it has moved to the trash. */
export interface LeftDeleted {
  readonly trashed: TrashedWorkflow;
  /** The name shown at Delete: once the workflow is in the trash, the page can't read it. */
  readonly name: string;
  /** Who runs it and now shows an error, or `undefined` when nothing does. */
  readonly line: string | undefined;
}

/**
 * Hands the strip's Undo to a toast that stays, once the person has left the page of a workflow
 * they deleted there: Back skips a deleted page, so the strip can't be reached again (C565 6). The
 * toast closes by itself once the workflow is back some other way, such as the workspace's undo.
 */
export function showLeftDeletedToast(
  host: WorkflowsHost,
  toasts: ToastStore,
  ref: WorkflowRef,
  { trashed, name, line }: LeftDeleted,
): void {
  const toastId = toasts.show({
    tone: "success",
    title: deleteWords.deletedToast(name, line !== undefined),
    ...(line === undefined ? {} : { text: line }),
    sticky: true,
    action: {
      label: deleteWords.undo,
      onClick: () =>
        void trashed.undo().catch((error: unknown) =>
          toasts.show({
            tone: "danger",
            title: deleteWords.couldntPutBack(name),
            text: errorReasonFor(error),
          }),
        ),
    },
  });
  const stopAll = () => {
    stopHost();
    stopToasts();
  };
  const stopHost = host.subscribe(() => {
    host.read(ref).then(
      () => {
        stopAll();
        toasts.close(toastId);
      },
      () => undefined,
    );
  });
  const stopToasts = toasts.subscribe(() => {
    if (!toasts.list().some((toast) => toast.id === toastId)) stopAll();
  });
}
