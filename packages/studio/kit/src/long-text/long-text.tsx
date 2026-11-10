import { useId, useState } from "react";
import { describedBy } from "../field/control.ts";
import { useFieldControl } from "../field/field.tsx";
import { ChevronRightIcon } from "../icons/chevron-right-icon.tsx";
import { fieldBoxClasses } from "../input/field-box.ts";
import { TextArea } from "../input/text-area.tsx";
import { usePresentation } from "../presentation/presentation.tsx";
import { TextSheet } from "../text-sheet/text-sheet.tsx";

export interface LongTextProps {
  readonly value: string;
  /** Every change, saved as you type, on desktop and in the text sheet alike. */
  readonly onChange: (value: string) => void;
  /** An example, never the label. On a phone it's the empty field's line: "Add instructions". */
  readonly placeholder?: string;
  /**
   * The text sheet closed with Done or Android back, with the text it opened with. When the
   * text changed, the screen shows the info toast ("Updated the instructions of Mail triage")
   * with Undo, which puts that text back as one step.
   */
  readonly onSheetDone?: (opened: string) => void;
  /** A save that failed, shown in the text sheet as a danger Callout. */
  readonly saveError?: string;
  /** Desktop only: it grows with its text up to this many lines, then scrolls inside. */
  readonly maxRows?: number;
}

/**
 * A long text field: Description, Instructions, an agent step's text. Put it in a `Field`. On
 * desktop it's the kit's TextArea. On a phone the text isn't typed in the page: the field is a
 * button that looks like the phone Input, shows the text folded after 8 lines with a chevron,
 * and opens the text sheet, which fills the screen (component specs 3, "The folded long-text
 * field"). Its name is the Field's label and the text is its description.
 *
 * @example
 * <Field label="Instructions" error={instructionsError}>
 *   <LongText value={instructions} placeholder="Add instructions" onChange={save}
 *     onSheetDone={(opened) => toastIfChanged(opened)} />
 * </Field>
 */
export function LongText(props: LongTextProps) {
  const phone = usePresentation() === "phone";
  if (!phone) {
    return (
      <TextArea
        value={props.value}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.target.value)}
        {...(props.maxRows === undefined ? {} : { maxRows: props.maxRows })}
      />
    );
  }
  return <FoldedText {...props} />;
}

/** The phone's folded field, and its text sheet while it's open. */
function FoldedText(props: LongTextProps) {
  const field = useFieldControl();
  const textId = useId();
  const [opened, setOpened] = useState<string | undefined>(undefined);
  const invalid = field?.invalid ?? false;
  const empty = props.value === "";

  function done() {
    const before = opened ?? props.value;
    setOpened(undefined);
    props.onSheetDone?.(before);
  }

  return (
    <>
      {/* The button lies over the whole box, so the box's look follows its focus (field-focus). */}
      <div
        className={`relative ${fieldBoxClasses(invalid ? "invalid" : "default", "md", "start")} py-3`}
      >
        <button
          type="button"
          id={field?.id}
          data-field-text=""
          aria-haspopup="dialog"
          aria-labelledby={field?.labelId}
          aria-describedby={describedBy(textId, field?.describedBy)}
          className="absolute inset-0 size-full cursor-pointer rounded-sm outline-none"
          onClick={() => setOpened(props.value)}
        />
        <span
          id={textId}
          className={`pointer-events-none relative line-clamp-8 min-w-0 flex-1 text-input-touch whitespace-pre-wrap wrap-break-word ${empty ? "text-fg-subtle" : "text-fg"}`}
        >
          {empty ? props.placeholder : props.value}
        </span>
        <span
          aria-hidden="true"
          className="pointer-events-none relative mt-0.5 inline-grid size-icon-md shrink-0 place-items-center text-fg-subtle *:size-full"
        >
          <ChevronRightIcon />
        </span>
      </div>
      {opened === undefined ? null : (
        <TextSheet
          title={field?.label ?? ""}
          value={props.value}
          hint={field?.hint}
          error={field?.error}
          onChange={props.onChange}
          onDone={done}
          {...(props.saveError === undefined ? {} : { saveError: props.saveError })}
        />
      )}
    </>
  );
}
