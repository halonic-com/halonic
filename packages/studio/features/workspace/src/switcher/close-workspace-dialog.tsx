import { Dialog } from "@halonicjs/studio-kit";
import { saveReasonWords } from "@halonicjs/studio-shell";
import type { CloseRequest } from "./workspace-switcher.ts";

/** The props of {@link CloseWorkspaceDialog}. */
export interface CloseWorkspaceDialogProps {
  readonly request: CloseRequest;
  readonly onCancel: () => void;
  readonly onCloseAnyway: () => void;
  readonly onTryAgain: () => void;
}

/** "Acme couldn't be saved: the disk is full." A reason with no words of its own ends after the name. */
export function notSavedLine(request: CloseRequest): string {
  const words = saveReasonWords(request.reason);
  return words === undefined
    ? `${request.name} couldn't be saved.`
    : `${request.name} couldn't be saved: ${words}.`;
}

/**
 * "Close Acme?" (UX checklist 1.3): asked only when the workspace's changes couldn't be saved.
 * **Cancel** is focused, **Close anyway** gives the changes up and **Try again** saves them again.
 *
 * @example
 * <CloseWorkspaceDialog request={request} onCancel={cancel} onCloseAnyway={close} onTryAgain={retry} />
 */
export function CloseWorkspaceDialog({
  request,
  onCancel,
  onCloseAnyway,
  onTryAgain,
}: CloseWorkspaceDialogProps) {
  return (
    <Dialog
      title={`Close ${request.name}?`}
      confirm={{ label: "Try again", busyLabel: "Saving…" }}
      alternative={{ label: "Close anyway", onClick: onCloseAnyway }}
      onConfirm={onTryAgain}
      onCancel={onCancel}
    >
      <p>{notSavedLine(request)}</p>
    </Dialog>
  );
}
