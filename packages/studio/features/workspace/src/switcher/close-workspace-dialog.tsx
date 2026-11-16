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
 * **Keep open** is focused, **Close anyway** throws the changes away and **Try again** saves them again.
 * While a save is still running there is no **Try again**, which would start a second save: the
 * answers are **Wait** (focused) and **Close anyway**.
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
      confirm={
        waiting
          ? { label: "Close anyway", variant: "danger", busyLabel: "Closing…" }
          : { label: "Try again", busyLabel: "Saving…" }
      }
      {...(waiting ? {} : { alternative: { label: "Close anyway", onClick: onCloseAnyway } })}
      onConfirm={waiting ? onCloseAnyway : onTryAgain}
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
