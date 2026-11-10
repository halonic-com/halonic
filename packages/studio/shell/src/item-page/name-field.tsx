import { isComposing } from "@halonicjs/studio-kit";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";

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
 * the old one comes back.
 */
export function NameField({ name, label, onRename }: NameFieldProps) {
  const [draft, setDraft] = useState(name);
  // The name this edit last asked for. Enter and then leaving the field is one edit, and `name`
  // may not have changed in between (the rename is async, or was rejected), so it's asked for
  // once. Typing starts a new edit, which may ask for the same name again.
  const asked = useRef<string | undefined>(undefined);

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
    <input
      type="text"
      aria-label={label}
      value={draft}
      // As wide as the name, so the ⋮ sits right after it.
      size={Math.max(draft.length, 1)}
      spellCheck={false}
      data-text-entry=""
      className={nameClasses}
      onChange={(event) => edit(event.target.value)}
      onKeyDown={onKeyDown}
      onBlur={keep}
    />
  );
}

// The title's look, with a 4px inset so the text lines up with the kind label; a quiet fill on hover
// says it can be edited, and focus is the standard ring.
const nameClasses = [
  "min-w-0 max-w-full truncate rounded-xs border-0 bg-transparent px-1 text-section text-fg",
  "hover:bg-surface-subtle focus:bg-surface focus-ring",
].join(" ");
