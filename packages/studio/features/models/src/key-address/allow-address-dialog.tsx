import { Dialog } from "@halonicjs/studio-kit";
import type { ShownKeyAddressQuestion } from "./key-address-queue.ts";
import { allowAddressTitle, allowAddressWords, currentlyAllowedFor } from "./key-address-text.ts";

/** Props for {@link AllowAddressDialog}. */
export interface AllowAddressDialogProps {
  readonly shown: ShownKeyAddressQuestion;
  readonly onAllow: () => void;
  /** Don't allow, Escape and closing the dialog all call it. */
  readonly onRefuse: () => void;
}

/**
 * "Allow this address?" (requirement `models.key-address.allow-address`): which provider would
 * send which key to which address, read in that order, then the warning and the scope line.
 * Focus starts on **Don't allow**; Escape is the same as pressing it. Nothing in it times out.
 * The address is one plain element, selectable and never cut, so it reads and copies as a whole.
 */
export function AllowAddressDialog({ shown, onAllow, onRefuse }: AllowAddressDialogProps) {
  const { question } = shown;
  return (
    <Dialog
      title={allowAddressTitle(shown.position, shown.count)}
      alert
      confirm={{ label: allowAddressWords.allow, busyLabel: allowAddressWords.saving }}
      cancelLabel={allowAddressWords.refuse}
      closeButton={false}
      busy={shown.saving}
      {...(shown.saveFailed ? { error: allowAddressWords.saveFailed } : {})}
      onConfirm={onAllow}
      onCancel={onRefuse}
      returnFocus={() => null}
    >
      <p>
        <strong className="text-fg">{question.provider}</strong> wants to send the key "
        {question.key}" to:
      </p>
      <p className="my-2 font-mono text-body text-fg select-text wrap-anywhere">
        {question.origin}
      </p>
      <p>{contextLine(question.allowed)}</p>
      <p className="mt-2">{allowAddressWords.warning}</p>
      <p className="mt-2">{allowAddressWords.scope}</p>
    </Dialog>
  );
}

/** The addresses the key has now, or that it has none. */
function contextLine(allowed: readonly string[] | undefined): string {
  return allowed === undefined || allowed.length === 0
    ? allowAddressWords.noAddressYet
    : `${currentlyAllowedFor} ${allowed.join(", ")}.`;
}
