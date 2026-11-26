import { Dialog } from "@halonicjs/studio-kit";
import { releasePage } from "./links.ts";
import { updatedTo, WHATS_NEW } from "./restart-text.ts";
import * as text from "./update-dialog-text.ts";
import { UpdateNotes } from "./update-notes.tsx";
import type { JustUpdated } from "./updater-status.ts";

/**
 * **Updated to Halonic 0.1.1** after the restart into an update (`settings.whats-new`): the version
 * it came from and what's new, kept from the update's manifest, with its release page. One way
 * on, **Close**.
 */
export function WhatsNewDialog({
  update,
  onClose,
}: {
  readonly update: JustUpdated;
  readonly onClose: () => void;
}) {
  return (
    <Dialog
      title={updatedTo(update.to)}
      size="md"
      confirm={{ label: text.CLOSE, busyLabel: text.CLOSE }}
      cancelButton={false}
      onConfirm={onClose}
      onCancel={onClose}
    >
      <div className="flex flex-col gap-4">
        <p className="text-small text-fg-muted">{text.updatedFrom(update.from)}</p>
        <UpdateNotes
          heading={WHATS_NEW}
          notes={update.notes === undefined ? [] : [{ version: update.to, notes: update.notes }]}
          notesUrl={releasePage(update.to)}
        />
      </div>
    </Dialog>
  );
}
