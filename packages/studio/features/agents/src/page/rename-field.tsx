import { Field, Input, isComposing } from "@halonicjs/studio-kit";
import { useState } from "react";
import { pageWords } from "./page-words.ts";

// On the desktop the name field is the title the eye reads, so the h1 that takes focus when the
// page opens lies over the avatar, "AGENT" and the name, with its text unseen: its ring outlines the
// title (AG4, HAL-14377). Clicks go through it to the field. On a phone it's for screen readers only.
const titleOverlayClasses = [
  "pointer-events-none absolute inset-0 select-none overflow-hidden whitespace-nowrap rounded-xs",
  "text-transparent focus-ring",
].join(" ");

export const titleClasses = (phone: boolean): string => (phone ? "sr-only" : titleOverlayClasses);

/** Props for {@link RenameField}. */
export interface RenameFieldProps {
  readonly name: string;
  /** The names of the other agents in the hub, for the "already exists" check. */
  readonly takenNames: readonly string[];
  /** Applies the new name; called once per rename, never with a name that fails the check. */
  readonly onRename: (name: string) => void;
}

/**
 * The agent's name as a field in the page header (`agents.page.rename`). The name is checked as it
 * is typed; Enter or leaving the field applies it, and Esc puts the old name back. Enter keeps focus
 * in the field, as the shell's `NameField` does (AG1, HAL-14377).
 */
export function RenameField({ name, takenNames, onRename }: RenameFieldProps) {
  const [draft, setDraft] = useState<string>();
  const text = draft ?? name;
  const trimmed = text.trim();
  const problem = nameProblem(trimmed, name, takenNames);

  const apply = () => {
    if (draft !== undefined && problem === null && trimmed !== name) onRename(trimmed);
    // A name with a problem is not applied; leaving the field puts the old one back.
    setDraft(undefined);
  };

  return (
    <Field label={pageWords.nameField} hideLabel error={problem}>
      <Input
        value={text}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={apply}
        onKeyDown={(event) => {
          if (isComposing(event.nativeEvent)) return;
          if (event.key === "Enter") {
            event.preventDefault();
            apply();
          }
          if (event.key === "Escape") setDraft(undefined);
        }}
      />
    </Field>
  );
}

/** The sentence for a name that can't be applied, or `null` when it can. */
function nameProblem(
  trimmed: string,
  current: string,
  takenNames: readonly string[],
): string | null {
  if (trimmed === "") return pageWords.nameMissing;
  if (trimmed === current) return null;
  const taken = takenNames.some((other) => other.toLowerCase() === trimmed.toLowerCase());
  return taken ? pageWords.nameTaken(trimmed) : null;
}
