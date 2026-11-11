import { isComposing } from "@halonicjs/studio-kit";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useCutTextTooltip } from "../cut-text/cut-text-tooltip.ts";

/** Props for {@link NameField}. */
export interface NameFieldProps {
  /** The item's name now. */
  readonly name: string;
  /** Its name, as a field's name: "Workflow name". */
  readonly label: string;
  /** Called with the new name, trimmed, when the user keeps one that differs. */
  readonly onRename: (name: string) => void;
}

/**
 * The item's name in its page header, as a rename field (req-shell `item-page.chat-and-panel`,
 * a11y 6.1). It reads as the title until it's hovered or focused. Enter or leaving the field keeps
 * the name; Esc puts the old one back, and that press does nothing else. An empty name isn't kept:
 * the old one comes back. A name cut with "…" shows in full as a tooltip.
 */
export function NameField({ name, label, onRename }: NameFieldProps) {
  const [draft, setDraft] = useState(name);
  // The name this edit last asked for. Enter and then leaving the field is one edit, and `name`
  // may not have changed in between (the rename is async, or was rejected), so it's asked for
  // once. Typing starts a new edit, which may ask for the same name again.
  const asked = useRef<string | undefined>(undefined);
  const tooltip = useCutTextTooltip(draft);

  // A rename from somewhere else (the file, another tab) shows here.
  useEffect(() => {
    setDraft(name);
  }, [name]);

  const keep = () => {
    const next = draft.trim();
    if (next === "" || next === name) {
      setDraft(name);
      return;
    }
    if (next === asked.current) {
      return;
    }
    asked.current = next;
    onRename(next);
  };

  const edit = (value: string) => {
    asked.current = undefined;
    setDraft(value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    editKeys(event);
    // Esc puts the old name back before it hides the tooltip: an inline edit is above a tooltip in
    // the Escape order (specs 23 A7).
    if (!(event.defaultPrevented || isComposing(event.nativeEvent))) {
      tooltip.anchor.onKeyDown(event);
    }
  };

  const editKeys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (isComposing(event.nativeEvent)) {
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      keep();
    } else if (event.key === "Escape" && draft !== name) {
      // The press is used, so the close stack under the page doesn't act on it too.
      event.preventDefault();
      setDraft(name);
    }
  };

  return (
    // The field and a hidden copy of its text share one grid cell, so the field is exactly as wide
    // as the name it shows, up to the room left, and the ⋮ sits right after it. The input's own width
    // must not count: `w-0` gives it none, so the hidden copy alone sets the cell's width, and
    // `min-w-full` then stretches the input to fill the cell. `size={1}` alone isn't enough, since
    // browsers still give a one-character input a minimum of several characters; it stays for
    // browsers that ignore `w-0` here. A `size` of the name's length counts average characters, which
    // comes out too wide or too narrow in a proportional font.
    <span className="inline-grid min-w-0 max-w-full grid-cols-[minmax(0,auto)]">
      <span aria-hidden="true" data-name-sizer="" className={sizerClasses}>
        {draft === "" ? " " : draft}
      </span>
      <input
        {...tooltip.anchor}
        type="text"
        size={1}
        aria-label={label}
        value={draft}
        spellCheck={false}
        data-text-entry=""
        className={nameClasses}
        onChange={(event) => edit(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          tooltip.anchor.onBlur();
          keep();
        }}
      />
      {tooltip.popover}
    </span>
  );
}

// The title's look, with a 4px inset so the text lines up with the kind label; a quiet fill on hover
// says it can be edited, and focus is the standard ring.
const nameClasses = [
  "col-start-1 row-start-1 w-0 min-w-full truncate rounded-xs border-0 bg-transparent px-1",
  "text-section text-fg hover:bg-surface-subtle focus:bg-surface focus-ring",
].join(" ");

// The same text, inset and type as the field, kept in the layout but never seen.
const sizerClasses =
  "invisible col-start-1 row-start-1 overflow-hidden whitespace-pre px-1 text-section";
