import type { InputHTMLAttributes, KeyboardEvent, Ref } from "react";
import { SearchIcon } from "../icons/search-icon.tsx";
import { fieldTextClasses, focusTextOnPress } from "../input/field-box.ts";
import { isComposing } from "../keyboard/is-composing.ts";

/** What the kit sets itself and a screen can't override. */
type OwnedAttributes = "className" | "style" | "type" | "placeholder" | "aria-label" | "size";

/** The props of `SearchField`. */
export interface SearchFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, OwnedAttributes> {
  /**
   * What it searches, shown in the empty field and its accessible name: "Search chats". With a
   * filter on, name it: "Search unread chats".
   */
  readonly label: string;
  readonly ref?: Ref<HTMLInputElement>;
}

/**
 * The pill: `surface-muted` with no edge, 40px high (48px on a phone), 16px before the 20px glass,
 * 12px to the text and 8px after it. While its text has focus it turns `surface` with a 2px
 * `accent` ring inside its edge (`field-focus:`, so a button added to the pill never lights it). In forced colours the fill is gone, so it keeps a 1px edge.
 */
const boxClasses = [
  "flex min-h-control-lg w-full items-center gap-3 rounded-full bg-surface-muted ps-4 pe-2",
  "phone:min-h-touch transition-colors",
  "field-focus:bg-surface field-focus:outline-2 field-focus:-outline-offset-2 field-focus:outline-accent",
  "has-disabled:cursor-not-allowed has-disabled:text-fg-disabled",
  "forced-colors:border forced-colors:border-[CanvasText]",
].join(" ");

/**
 * The search over a two-pane app's list (build plan P2 on HAL-20617, `kit.search-field`): a round
 * `type="search"` field with the glass at its start, named by its `label`, which is also what the
 * empty field says. A press anywhere on the pill puts the caret in its text.
 *
 * Use it where the person filters a list as they type, such as the Messenger's chats; a form's
 * own fields keep `Input`.
 *
 * @example
 * <SearchField label="Search chats" value={term} onChange={(event) => setTerm(event.target.value)} />
 */
export function SearchField({ label, ref, onKeyDown, ...native }: SearchFieldProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && isComposing(event)) {
      // The Enter that picks a word must not reach the screen or submit a form round the field.
      event.preventDefault();
      return;
    }
    onKeyDown?.(event);
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a mouse convenience only; the keyboard reaches the text itself.
    <div className={boxClasses} onMouseDown={focusTextOnPress}>
      <span
        className="inline-grid size-icon-md shrink-0 place-items-center text-fg-subtle *:size-full"
        aria-hidden="true"
      >
        <SearchIcon />
      </span>
      <input
        {...native}
        ref={ref}
        type="search"
        aria-label={label}
        placeholder={label}
        data-field-text=""
        data-text-entry=""
        className={`${fieldTextClasses} self-stretch`}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
