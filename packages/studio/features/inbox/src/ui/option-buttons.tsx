import type { InboxAnswer, InboxItemOption } from "@halonicjs/ports";
import { Button, Field, TextArea, useFieldControl } from "@halonicjs/studio-kit";
import { type ReactNode, useEffect, useRef, useState } from "react";

/** Props for {@link OptionButtons}. */
export interface OptionButtonsProps {
  readonly options: readonly InboxItemOption[];
  /** Why every button is off, such as an answered item or a source that is offline. */
  readonly unavailable: { readonly reason: string } | undefined;
  readonly busy: (answer: InboxAnswer) => boolean;
  readonly onAnswer: (answer: InboxAnswer) => void;
}

/**
 * An item's options as buttons, the first one primary (`inbox.option-note`). An option that takes
 * a note sends nothing when pressed: the row makes room for a field labelled as the source says,
 * focused, with that option's button and **Cancel** under it, the kit's form for Ask for changes
 * (component specs 23 A8). Cancel or Escape brings the buttons back and sends nothing. While a
 * required note is empty its button stays off, and the field's label says why.
 */
export function OptionButtons({ options, unavailable, busy, onAnswer }: OptionButtonsProps) {
  const [writing, setWriting] = useState<InboxItemOption | undefined>(undefined);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const focusOnReturn = useRef<string | undefined>(undefined);
  // After Cancel, focus goes back to the button that opened the field, once the row is drawn again.
  useEffect(() => {
    if (writing !== undefined || focusOnReturn.current === undefined) return;
    buttons.current.get(focusOnReturn.current)?.focus();
    focusOnReturn.current = undefined;
  }, [writing]);

  if (writing !== undefined) {
    const close = () => {
      focusOnReturn.current = writing.id;
      setWriting(undefined);
    };
    return (
      <NoteForm
        option={writing}
        label={noteLabelOf(writing) ?? writing.label}
        unavailable={unavailable}
        busy={busy}
        onSend={onAnswer}
        onCancel={close}
      />
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option, index) => (
        <Button
          key={option.id}
          ref={(button: HTMLButtonElement | null) => {
            if (button === null) buttons.current.delete(option.id);
            else buttons.current.set(option.id, button);
          }}
          variant={index === 0 ? "primary" : "secondary"}
          unavailable={unavailable}
          busy={busy({ kind: "option", option: option.id })}
          onClick={() =>
            noteLabelOf(option) === undefined
              ? onAnswer({ kind: "option", option: option.id })
              : setWriting(option)
          }
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

/**
 * The label of an option's note field, or none when the option takes no note. A required note
 * without a label of its own is labelled with the option, so it can still be written.
 */
function noteLabelOf(option: InboxItemOption): string | undefined {
  if (option.noteLabel !== undefined) return option.noteLabel;
  return option.noteRequired === true ? option.label : undefined;
}

interface NoteFormProps {
  readonly option: InboxItemOption;
  readonly label: string;
  readonly unavailable: { readonly reason: string } | undefined;
  readonly busy: (answer: InboxAnswer) => boolean;
  readonly onSend: (answer: InboxAnswer) => void;
  readonly onCancel: () => void;
}

/** The note one option sends with it, written in the kit's field, then that option's button or Cancel. */
function NoteForm({ option, label, unavailable, busy, onSend, onCancel }: NoteFormProps) {
  const [note, setNote] = useState("");
  const written = note.trim();
  const answer: InboxAnswer =
    written === ""
      ? { kind: "option", option: option.id }
      : { kind: "option", option: option.id, note: written };
  const waitsForNote = option.noteRequired === true && written === "";

  return (
    <Field label={label}>
      <TextArea
        value={note}
        minRows={3}
        // The person just pressed the option to write its note.
        autoFocus
        onChange={(event) => setNote(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          // Escape closes only the note, not a sheet or page around the card.
          event.stopPropagation();
          onCancel();
        }}
      />
      <WithLabelId>
        {(labelId) => (
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              variant="primary"
              unavailable={unavailable ?? (waitsForNote ? { reason: labelId } : undefined)}
              busy={busy(answer)}
              onClick={() => onSend(answer)}
            >
              {option.label}
            </Button>
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        )}
      </WithLabelId>
    </Field>
  );
}

/** The `id` of the Field's label around it, so a button can say why it's off with the label's words. */
function WithLabelId({ children }: { readonly children: (labelId: string) => ReactNode }) {
  const field = useFieldControl();
  if (field === undefined) throw new Error("WithLabelId is used outside a Field.");
  return children(field.labelId);
}
