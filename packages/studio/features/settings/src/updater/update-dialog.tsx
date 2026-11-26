import { Callout, Dialog } from "@halonicjs/studio-kit";
import { useId } from "react";
import type { AgentSandboxHost } from "../api.ts";
import { DownloadBar } from "./about-section.tsx";
import { aboutView } from "./about-state.ts";
import { CANCEL_DOWNLOAD, TRY_AGAIN, UPDATER_DIDNT_ANSWER } from "./about-text.ts";
import { dialogConfirm, notesFor, offeredUpdate } from "./update-dialog-state.ts";
import * as text from "./update-dialog-text.ts";
import { UpdateNotes } from "./update-notes.tsx";
import type { UpdaterHost } from "./updater-host.ts";
import { useSandboxSetUp } from "./use-sandbox-set-up.ts";
import { useUpdater } from "./use-updater.ts";

/** The props of {@link UpdateDialog}. */
export interface UpdateDialogProps {
  readonly host: UpdaterHost;
  /** Asked only whether the sandbox is set up, for the line that the update sets it up again. */
  readonly sandbox?: AgentSandboxHost | undefined;
  readonly announce: (line: string) => void;
  /** The restart flow: restarts at once, or first asks about the runs a restart would stop. */
  readonly onRestart: () => void;
  readonly onClose: () => void;
}

/**
 * **Update available** (`settings.update-dialog`): the state line, which names the version (no
 * heading repeats it, HAL-19579), what changed, and one button for
 * where the update is. **Install** downloads it, with the progress bar, and becomes **Restart**
 * when it is ready; an update already downloaded offers **Restart** at once. A failed download
 * says why with **Try again**, and a press the updater didn't answer says so: nothing fails
 * silently. It closes by itself once nothing newer is offered.
 */
export function UpdateDialog({ host, sandbox, announce, onRestart, onClose }: UpdateDialogProps) {
  const updater = useUpdater(host, announce);
  const sandboxSetUp = useSandboxSetUp(sandbox, updater.status?.sandboxSetupAgain === true);
  const lineId = useId();
  const { status } = updater;
  const state = offeredUpdate(status);
  if (status === null || state === null) return null;
  const view = aboutView(status, new Date(), sandboxSetUp);
  const confirm = dialogConfirm(state);
  const { notes, notesUrl } = notesFor(host, state);
  const onConfirm = () => {
    if (confirm.action === "download") return updater.download();
    onClose();
    if (confirm.action === "restart") onRestart();
  };
  // An install that failed (a download, or a signature that doesn't match) is a danger Callout;
  // its one action, Try again or Close, stays in the footer.
  const failed = view.callout || state.kind === "download-failed";
  const failure = updater.unanswered
    ? { error: UPDATER_DIDNT_ANSWER, errorAction: { label: TRY_AGAIN, onClick: updater.retry } }
    : {};
  return (
    <Dialog
      title={text.UPDATE_AVAILABLE}
      size="md"
      cancelLabel={text.NOT_NOW}
      cancelButton={confirm.action !== "close"}
      confirm={{
        label: confirm.label,
        busyLabel: text.RESTARTING,
        ...(confirm.waiting === null ? {} : { unavailable: { reason: lineId } }),
      }}
      {...(state.kind === "downloading"
        ? { alternative: { label: CANCEL_DOWNLOAD, onClick: updater.cancel } }
        : {})}
      onConfirm={onConfirm}
      onCancel={onClose}
      {...failure}
    >
      <div className="flex flex-col gap-4">
        {failed ? (
          <Callout tone="danger">
            <span id={lineId}>{view.line}</span>
          </Callout>
        ) : (
          <p id={lineId} className="text-small">
            {view.line}
          </p>
        )}
        {view.progress === null ? null : <DownloadBar progress={view.progress} />}
        <UpdateNotes heading={text.WHAT_CHANGED} notes={notes} notesUrl={notesUrl} />
        {view.setupAgain === null ? null : (
          <p className="text-small text-fg-muted">{view.setupAgain}</p>
        )}
      </div>
    </Dialog>
  );
}
