import { Dialog } from "@halonicjs/studio-kit";
import { couldNotSaveText } from "@halonicjs/studio-shell";
import type { CloseRequest } from "./workspace-switcher.ts";

/** The props of {@link CloseWorkspaceDialog}. */
export interface CloseWorkspaceDialogProps {
  readonly request: CloseRequest;
  readonly onCancel: () => void;
  readonly onCloseAnyway: () => void;
  readonly onTryAgain: () => void;
  /** Whether **Try again** is saving: "Saving…", and the buttons wait. */
  readonly busy: boolean;
}

/** "Couldn't save Acme: the disk is full." The same line as the toolbar's and the toast's. */
export function notSavedLine(request: CloseRequest): string {
  return request.reason === "still-saving"
    ? `${request.name} is still saving.`
    : couldNotSaveText(request.name, request.reason);
}

/** What **Close anyway** costs, said before it is pressed. */
export const closeAnywayCost = "Close anyway throws away the changes.";

/**
 * "Close Acme?" (UX checklist 1.3): asked only when the workspace's changes couldn't be saved.
 * **Keep open** (**Wait** while a save is still running) is focused, **Close anyway** throws the changes away and **Try again** saves them again.
 *
 * @example
 * <CloseWorkspaceDialog request={request} onCancel={cancel} onCloseAnyway={close} onTryAgain={retry} busy={false} />
 */
export function CloseWorkspaceDialog({
  request,
  onCancel,
  onCloseAnyway,
  onTryAgain,
  busy,
}: CloseWorkspaceDialogProps) {
  const waiting = request.reason === "still-saving";
  return (
    <Dialog
      title={`Close ${request.name}?`}
      confirm={{ label: "Try again", busyLabel: "Saving…" }}
      alternative={{ label: "Close anyway", onClick: onCloseAnyway }}
      onConfirm={onTryAgain}
      busy={busy}
      cancelLabel={waiting ? "Wait" : "Keep open"}
      closeLabel={waiting ? `Wait for ${request.name}` : `Keep ${request.name} open`}
      onCancel={onCancel}
    >
      <p>
        {notSavedLine(request)} {closeAnywayCost}
      </p>
    </Dialog>
  );
}
