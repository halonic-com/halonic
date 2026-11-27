import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  type TextareaHTMLAttributes,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";
import { describedBy } from "../field/control.ts";
import { useFieldControl } from "../field/field.tsx";
import { isComposing } from "../keyboard/is-composing.ts";
import {
  type FieldLook,
  fieldBoxClasses,
  fieldBoxState,
  fieldTextClasses,
  focusTextOnPress,
  promptBoxClasses,
  promptTextClasses,
} from "./field-box.ts";

const fieldTextAreaClasses = `${fieldTextClasses} max-h-rows`;

// A margin, not padding: the textarea is border-box, so padding would come out of its line limit
// and cut the last line in half. A press on the margin still puts the caret in the text.
const promptTextAreaClasses = `${promptTextClasses} my-1.5 max-h-rows-reading`;

type OwnedAttributes =
  | "className"
  | "style"
  | "id"
  | "rows"
  | "aria-invalid"
  | "aria-describedby"
  | "aria-required";

/** The props of `TextArea`. */
export interface TextAreaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, OwnedAttributes> {
  /** It grows with its text up to this many lines, then scrolls inside. Default 5. */
  readonly maxRows?: number;
  /** It is at least this many lines tall, even when empty. Default 1. */
  readonly minRows?: number;
  /**
   * Ctrl Enter (⌘ Enter on macOS) submits its form. Off by default: only the forms component
   * specs 23 A8 names turn it on (Create version, Start a run, Ask for changes, a request's
   * message), so no key can confirm an Approve, Reject, Apply or Delete.
   */
  readonly submitOnCtrlEnter?: boolean;
  /** The `id` of a line outside the Field that also describes the control, read after the Field's own. */
  readonly describedBy?: string;
  /**
   * A line inside the box's frame, above the text, such as a channel's To line with its chips. A
   * press on it outside a button puts the caret in the text, as a press on the padding does.
   */
  readonly header?: ReactNode;
  /** `prompt` only for a chat's box, with its round buttons in `leading` and `trailing`. */
  readonly look?: FieldLook;
  /** Inside the box, before the text and at its last line: a chat's round Attach. */
  readonly leading?: ReactNode;
  /** Inside the box, after the text and at its last line: a chat's round Send. */
  readonly trailing?: ReactNode;
  readonly ref?: Ref<HTMLTextAreaElement>;
}

/** The form sheet's limit (component specs 3): 5 lines, then the text scrolls. */
const DEFAULT_MAX_ROWS = 5;

/**
 * A text field of several lines that grows with its text. Enter adds a line; with
 * `submitOnCtrlEnter`, Ctrl Enter (⌘ Enter on macOS) submits its form (component specs 23, A8).
 * Neither does anything while an input method is composing. Put it in a `Field`, like `Input`.
 *
 * @example
 * <Field label="Message">
 *   <TextArea
 *     value={message}
 *     submitOnCtrlEnter
 *     onChange={(event) => setMessage(event.target.value)}
 *   />
 * </Field>
 */
export function TextArea({
  maxRows = DEFAULT_MAX_ROWS,
  minRows = 1,
  submitOnCtrlEnter = false,
  describedBy: extraDescription,
  header,
  look = "field",
  leading,
  trailing,
  ref,
  onKeyDown,
  onInput,
  ...native
}: TextAreaProps) {
  const field = useFieldControl();
  const invalid = field?.invalid ?? false;
  const state = fieldBoxState({ disabled: native.disabled, invalid, readOnly: native.readOnly });
  const element = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => element.current as HTMLTextAreaElement);

  // A value set from outside (a reset, a loaded draft) resizes it as typing does.
  useLayoutEffect(() => {
    fitToText(element.current);
  }, [native.value]);

  // A new width rewraps the text, and a TextArea that mounted hidden gets its first width when
  // it's shown: either way the height is fitted again. Only the width counts, so setting the
  // height never calls this again.
  useEffect(() => {
    const textarea = element.current;
    if (textarea === null || typeof ResizeObserver === "undefined") {
      return;
    }
    let width: number | undefined;
    const observer = new ResizeObserver(([entry]) => {
      const next = entry?.contentRect.width;
      if (next !== width) {
        width = next;
        fitToText(textarea);
      }
    });
    observer.observe(textarea);
    return () => observer.disconnect();
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && isComposing(event)) {
      // The Enter that picks a word belongs to the input method, as in the Input: it neither
      // submits nor reaches the screen's handler. A TextArea has no default Enter to prevent.
      return;
    }
    const form = event.currentTarget.form;
    const isCtrlEnter = event.key === "Enter" && (event.ctrlKey || event.metaKey);
    if (submitOnCtrlEnter && isCtrlEnter && form !== null) {
      event.preventDefault();
      form.requestSubmit();
      return;
    }
    onKeyDown?.(event);
  }

  const text = (
    <textarea
      {...native}
      ref={element}
      id={field?.id}
      rows={minRows}
      data-field-text=""
      data-text-entry=""
      className={`${look === "prompt" ? promptTextAreaClasses : fieldTextAreaClasses} resize-none overflow-y-auto`}
      // The limit in lines of the text's own height, so it follows the text size
      // (theme-utilities.css).
      style={{ "--max-rows": maxRows } as CSSProperties}
      aria-describedby={describedBy(field?.describedBy, extraDescription)}
      aria-invalid={invalid || undefined}
      aria-required={field?.required || undefined}
      onKeyDown={handleKeyDown}
      onInput={(event) => {
        fitToText(event.currentTarget);
        onInput?.(event);
      }}
    />
  );

  // A prompt's 7px round its 36px buttons makes one line 52px tall, and the text starts clear of
  // a round end that holds no button.
  const promptPadding = `p-[7px] ${leading === undefined ? "ps-4" : ""} ${trailing === undefined ? "pe-4" : ""}`;
  const boxClasses =
    look === "prompt"
      ? `${promptBoxClasses(state, "end")} ${promptPadding}`
      : `${fieldBoxClasses(state, "md", "start")} py-2 phone:py-3`;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a mouse convenience only; the keyboard reaches the text itself.
    <div className={boxClasses} onMouseDown={focusTextOnPress}>
      {leading}
      {header === undefined ? (
        text
      ) : (
        // A grid, so the text keeps the height it fits itself to under the header.
        <div className="grid min-w-0 flex-1 gap-1">
          {header}
          {text}
        </div>
      )}
      {trailing}
    </div>
  );
}

/**
 * Sets the height to the text's, so the box grows line by line; max-height stops it. A hidden
 * TextArea measures 0: it gets no height then, so it isn't 0px tall when it's shown.
 */
function fitToText(textarea: HTMLTextAreaElement | null): void {
  if (textarea === null) {
    return;
  }
  textarea.style.height = "auto";
  const height = textarea.scrollHeight;
  textarea.style.height = height === 0 ? "" : `${height}px`;
}
