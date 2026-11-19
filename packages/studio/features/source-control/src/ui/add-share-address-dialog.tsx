import { Dialog, Field, Input } from "@halonicjs/studio-kit";
import { useEffect, useRef, useState } from "react";
import type { ChangesList } from "../changes-list.ts";
import { shareWords } from "../changes-words.ts";

/** Props for {@link AddShareAddressDialog}. */
export interface AddShareAddressDialogProps {
  readonly list: ChangesList;
  /** Closes the dialog, with or without an address added. */
  readonly onClose: () => void;
  /** Where focus goes on close when the button that opened it has gone. */
  readonly returnFocus: () => HTMLElement | null;
}

/**
 * Add where to share (checklist part 2, 2.3, T9-F20): one git address. Add stays pressable: an
 * empty field or an address that isn't `https://`, `ssh://` or `user@host:path` says what an
 * address looks like under the field, and git refusing it says why in the dialog.
 */
export function AddShareAddressDialog({ list, onClose, returnFocus }: AddShareAddressDialogProps) {
  const [address, setAddress] = useState("");
  const [fieldError, setFieldError] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  // The dialog may close while git is still answering; nothing is set on a closed dialog.
  const open = useRef(true);
  useEffect(() => {
    // Set here as well as in the ref: StrictMode runs the cleanup and the effect again on mount,
    // and without this every answer would be dropped in the dev server.
    open.current = true;
    return () => {
      open.current = false;
    };
  }, []);

  async function add() {
    if (busy) return;
    setError(undefined);
    setBusy(true);
    const reason = await list.addShareAddress(address);
    if (!open.current) return;
    if (reason === undefined) {
      onClose();
      return;
    }
    setBusy(false);
    // The address's own shape is the field's to say; anything else is git's.
    if (reason === shareWords.badAddress) setFieldError(reason);
    else setError(`${shareWords.failed}. ${reason}`);
  }

  return (
    <Dialog
      title={shareWords.addWhereToShare}
      size="md"
      form
      confirm={{ label: shareWords.add, busyLabel: shareWords.adding }}
      busy={busy}
      {...(error === undefined ? {} : { error, retryLabel: shareWords.tryAgain })}
      returnFocus={returnFocus}
      onConfirm={() => void add()}
      onCancel={onClose}
    >
      <div className="flex flex-col gap-4">
        <p className="text-body">{shareWords.intro}</p>
        <Field
          label={shareWords.addressLabel}
          hint={shareWords.addressHint}
          error={fieldError ?? null}
        >
          <Input
            mono
            value={address}
            onChange={(event) => {
              setFieldError(undefined);
              setAddress(event.target.value);
            }}
          />
        </Field>
      </div>
    </Dialog>
  );
}
