import { Dialog } from "@halonicjs/studio-kit";
import { discardWords } from "../changes-words.ts";
import type { UndoItem } from "./use-undo-item.ts";

/**
 * The one question **Undo these changes** asks (checklist part 2, 2.5): Halonic couldn't keep a
 * copy of what it would put back, so going on can't be undone. Shows nothing when no undo waits.
 */
export function UndoWithoutCopyDialog({ undoing }: { readonly undoing: UndoItem }) {
  const item = undoing.withoutCopyFor;
  if (item === undefined) return null;
  return (
    <Dialog
      title={discardWords.noCopyTitle(item.name)}
      size="sm"
      confirm={{
        label: discardWords.noCopyConfirm,
        variant: "danger",
        busyLabel: discardWords.noCopyBusy,
      }}
      onConfirm={() => void undoing.undoWithoutCopy()}
      onCancel={undoing.cancelWithoutCopy}
    >
      <p className="text-body">{discardWords.noCopyBody}</p>
    </Dialog>
  );
}
