import type { InboxAnswer, InboxItemOption } from "@halonicjs/ports";
import { Button } from "@halonicjs/studio-kit";
import { useId, useState } from "react";

/** Props for {@link OptionButtons}. */
export interface OptionButtonsProps {
  readonly options: readonly InboxItemOption[];
  /** Why every button is off, such as an answered item or a source that is offline. */
  readonly unavailable: { readonly reason: string } | undefined;
  readonly busy: (answer: InboxAnswer) => boolean;
  readonly onAnswer: (answer: InboxAnswer) => void;
}

/**
 * An item's options as buttons, the first one primary. An option that takes a note gets a field
 * labelled as the source says, and its button sends what was written there; while a required
 * note is empty its button stays off, and the field's label says why (`inbox.option-note`).
 */
export function OptionButtons({ options, unavailable, busy, onAnswer }: OptionButtonsProps) {
  const fieldIds = useId();
  const [notes, setNotes] = useState<Readonly<Record<string, string>>>({});
  const answerOf = (option: InboxItemOption): InboxAnswer => {
    const note = notes[option.id]?.trim() ?? "";
    return note === ""
      ? { kind: "option", option: option.id }
      : { kind: "option", option: option.id, note };
  };
  const labelIdOf = (index: number) => `${fieldIds}-note-${index}`;

  return (
    <>
      {options.map((option, index) => {
        const label = noteLabelOf(option);
        if (label === undefined) return null;
        return (
          <NoteField
            key={option.id}
            fieldId={`${fieldIds}-field-${index}`}
            labelId={labelIdOf(index)}
            label={label}
            value={notes[option.id] ?? ""}
            onChange={(value) => setNotes((written) => ({ ...written, [option.id]: value }))}
          />
        );
      })}
      <div className="flex flex-wrap gap-2">
        {options.map((option, index) => {
          const chosen = answerOf(option);
          const waitsForNote = option.noteRequired === true && !("note" in chosen);
          return (
            <Button
              key={option.id}
              variant={index === 0 ? "primary" : "secondary"}
              unavailable={unavailable ?? (waitsForNote ? { reason: labelIdOf(index) } : undefined)}
              busy={busy(chosen)}
              onClick={() => onAnswer(chosen)}
            >
              {option.label}
            </Button>
          );
        })}
      </div>
    </>
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

interface NoteFieldProps {
  readonly fieldId: string;
  readonly labelId: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}

/** The written note one option sends with it. */
function NoteField({ fieldId, labelId, label, value, onChange }: NoteFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <label id={labelId} htmlFor={fieldId} className="text-small text-fg-muted">
        {label}
      </label>
      <textarea
        id={fieldId}
        value={value}
        rows={3}
        onChange={(event) => onChange(event.target.value)}
        className="focus-ring rounded-sm border border-border bg-surface px-3 py-2 text-body text-fg"
      />
    </div>
  );
}
