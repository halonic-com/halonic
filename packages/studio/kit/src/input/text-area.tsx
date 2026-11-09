import {
  type KeyboardEvent,
  type Ref,
  type TextareaHTMLAttributes,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";
import { useFieldControl } from "../field/field.tsx";
import { isComposing } from "../keyboard/is-composing.ts";
import { fieldBoxClasses, fieldBoxState, fieldTextClasses } from "./field-box.ts";

type OwnedAttributes =
  | "className"
  | "style"
  | "id"
  | "rows"
  | "aria-invalid"
  | "aria-describedby"
  | "aria-required";

export interface TextAreaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, OwnedAttributes> {
  /** It grows with its text up to this many lines, then scrolls inside. Default 5. */
  readonly maxRows?: number;
  readonly ref?: Ref<HTMLTextAreaElement>;
}

/** The form sheet's limit (component specs 3): 5 lines, then the text scrolls. */
const DEFAULT_MAX_ROWS = 5;

/**
 * A text field of several lines that grows with its text. Enter adds a line; Ctrl Enter (⌘ Enter
 * on macOS) submits its form (component specs 23, A8). Neither does anything while an input
 * method is composing. Put it in a `Field`, like `Input`.
 *
 * @example
 * <Field label="Message">
 *   <TextArea value={message} onChange={(event) => setMessage(event.target.value)} />
 * </Field>
 */
export function TextArea({
  maxRows = DEFAULT_MAX_ROWS,
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

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const submits = event.key === "Enter" && (event.ctrlKey || event.metaKey);
    if (submits && !isComposing(event)) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
      return;
    }
    onKeyDown?.(event);
  }

  return (
    <div className={`${fieldBoxClasses(state, "md")} items-start py-2 phone:py-3`}>
      <textarea
        {...native}
        ref={element}
        id={field?.id}
        rows={1}
        data-field-text=""
        className={`${fieldTextClasses} resize-none overflow-y-auto`}
        // The limit in lines of the text's own height: it follows the text size.
        style={{ maxHeight: `${maxRows}lh` }}
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

/** Sets the height to the text's, so the box grows line by line; max-height stops it. */
function fitToText(textarea: HTMLTextAreaElement | null): void {
  if (textarea === null) {
    return;
  }
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}
