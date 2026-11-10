import {
  type CSSProperties,
  type KeyboardEvent,
  type Ref,
  type TextareaHTMLAttributes,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";
import { useFieldControl } from "../field/field.tsx";
import { isComposing } from "../keyboard/is-composing.ts";
import { fieldBoxClasses, fieldBoxState, fieldTextClasses, focusTextOnPress } from "./field-box.ts";

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
  /**
   * Ctrl Enter (⌘ Enter on macOS) submits its form. Off by default: only the forms component
   * specs 23 A8 names turn it on (Create version, Start a run, Ask for changes, a request's
   * message), so no key can confirm an Approve, Reject, Apply or Delete.
   */
  readonly submitOnCtrlEnter?: boolean;
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
  submitOnCtrlEnter = false,
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

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a mouse convenience only; the keyboard reaches the text itself.
    <div
      className={`${fieldBoxClasses(state, "md", "start")} py-2 phone:py-3`}
      onMouseDown={focusTextOnPress}
    >
      <textarea
        {...native}
        ref={element}
        id={field?.id}
        rows={1}
        data-field-text=""
        data-text-entry=""
        className={`${fieldTextClasses} max-h-rows resize-none overflow-y-auto`}
        // The limit in lines of the text's own height, so it follows the text size
        // (theme-utilities.css).
        style={{ "--max-rows": maxRows } as CSSProperties}
        aria-describedby={field?.describedBy}
        aria-invalid={invalid || undefined}
        aria-required={field?.required || undefined}
        onKeyDown={handleKeyDown}
        onInput={(event) => {
          fitToText(event.currentTarget);
          onInput?.(event);
        }}
      />
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
