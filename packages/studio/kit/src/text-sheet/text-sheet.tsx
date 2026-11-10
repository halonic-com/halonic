import { type ReactNode, useId, useRef } from "react";
import { Button } from "../button/button.tsx";
import { AlertSlot } from "../dialog/alert-slot.tsx";
import { describedBy } from "../field/control.ts";
import { FieldLine } from "../field/field.tsx";
import { SheetFrame } from "../sheet/sheet-frame.tsx";

/** The props of `TextSheet`. */
export interface TextSheetProps {
  /** The field's label: "Instructions", "Description". */
  readonly title: string;
  readonly value: string;
  /** Every change, saved as you type after the usual short pause: the sheet has no Save. */
  readonly onChange: (value: string) => void;
  /**
   * Done or Android back, while there's no `error`: the screen unmounts the sheet. If the text
   * changed, it shows the info toast with Undo, which puts back the text the sheet opened with.
   */
  readonly onDone: () => void;
  /** The field's hint, at the top of the sheet. */
  readonly hint?: ReactNode;
  /**
   * The field's error ("Add a description."): shown under the hint as a Field error, and Done and
   * back don't close the sheet but move focus into the text, so the error is read. The text with
   * the mistake isn't saved; that's the screen's save model.
   */
  readonly error?: string | null | undefined;
  /**
   * A save that failed: a danger Callout above the text, read through the alert slot. Done still
   * closes, and the page's save line keeps saying it.
   */
  readonly saveError?: string;
  /** Where focus goes on close when the opener has gone (component specs 23 A2). */
  readonly returnFocus?: () => HTMLElement | null;
}

/**
 * The sheet that edits a saved field's long text on a phone (component specs 15.3): the field's
 * label as the title 16px in, Done at the right and no Close, since the sheet cancels nothing.
 * One textarea fills the rest of the screen down to the keyboard, with no border of its own;
 * Enter adds a line, and it's never shorter than 3 lines, so the body scrolls before it shrinks.
 * The folded long-text field opens it; a screen can too.
 *
 * @example
 * {editing ? (
 *   <TextSheet title="Instructions" value={text} onChange={save}
 *     onDone={() => { setEditing(false); toastIfChanged(); }} />
 * ) : null}
 */
export function TextSheet(props: TextSheetProps) {
  const hintId = useId();
  const errorId = useId();
  const text = useRef<HTMLTextAreaElement>(null);
  const invalid = props.error !== undefined && props.error !== null && props.error !== "";
  const hasHint = props.hint !== undefined && props.hint !== null && props.hint !== "";

  function done() {
    if (invalid) {
      text.current?.focus();
      return;
    }
    props.onDone();
  }

  return (
    <SheetFrame
      title={props.title}
      onCancel={done}
      actions={
        <Button variant="primary" size="lg" onClick={done}>
          Done
        </Button>
      }
      {...(props.returnFocus === undefined ? {} : { returnFocus: props.returnFocus })}
    >
      <div className="flex min-h-full flex-col">
        {hasHint || invalid ? (
          <div className="flex flex-col gap-1 px-4 pt-3">
            {hasHint ? (
              <p id={hintId} className="text-small text-fg-muted">
                {props.hint}
              </p>
            ) : null}
            <FieldLine id={errorId} hint={undefined} error={props.error} />
          </div>
        ) : null}
        <div className="px-4">
          <AlertSlot error={props.saveError} attempt={0} waiting={false} />
        </div>
        <textarea
          ref={text}
          value={props.value}
          data-text-entry=""
          aria-label={props.title}
          aria-describedby={describedBy(
            hasHint ? hintId : undefined,
            invalid ? errorId : undefined,
          )}
          aria-invalid={invalid || undefined}
          className="min-h-24 w-full flex-1 resize-none border-0 bg-transparent px-4 py-3 text-input-touch text-fg outline-none placeholder:text-fg-subtle"
          onChange={(event) => props.onChange(event.target.value)}
        />
      </div>
    </SheetFrame>
  );
}
