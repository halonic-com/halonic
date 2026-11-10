import { Dialog, Field, TextArea } from "@halonicjs/studio-kit";
import { useRef, useState } from "react";

/** The empty note's field error (mc 10.2, state-coverage D6). */
export const emptyNoteError = "Say what should change.";

export interface AskForChangesDialogProps {
  /** The note so far: the card keeps it, so Cancel or a failed send doesn't lose it. */
  readonly note: string;
  readonly onNoteChange: (note: string) => void;
  /** True while the note is sent: **Send note** reads "Sending note…" and Cancel waits. */
  readonly busy: boolean;
  /** "Couldn't record your decision." after a failed send, read from the dialog's alert slot. */
  readonly error: string | undefined;
  /** Sends the note; only called with text in it. */
  readonly onSend: (note: string) => void;
  /** Cancel, the ✕ and Escape. Focus goes back to **Ask for changes**. */
  readonly onCancel: () => void;
}

/**
 * **Ask for changes** on desktop (flow-inbox 5.3, a11y 8.3): a small form dialog with the note
 * focused. Enter adds a line and Ctrl Enter sends, the same as **Send note**; a note is a message
 * to the agent, so no key approves or rejects. **Send note** is never disabled: with an empty note
 * it shows "Say what should change." under the field and focuses it.
 */
export function AskForChangesDialog(props: AskForChangesDialogProps) {
  const { note, busy } = props;
  const field = useRef<HTMLTextAreaElement>(null);
  const [empty, setEmpty] = useState(false);

  function send() {
    if (note.trim() === "") {
      setEmpty(true);
      field.current?.focus();
      return;
    }
    props.onSend(note);
  }

  return (
    <Dialog
      title="Ask for changes"
      form
      confirm={{ label: "Send note", busyLabel: "Sending note…" }}
      busy={busy}
      {...(props.error === undefined ? {} : { error: props.error })}
      onConfirm={send}
      onCancel={props.onCancel}
    >
      <Field label="Note" error={empty ? emptyNoteError : null}>
        <TextArea
          ref={field}
          value={note}
          submitOnCtrlEnter
          onChange={(event) => {
            setEmpty(false);
            props.onNoteChange(event.target.value);
          }}
        />
      </Field>
    </Dialog>
  );
}
