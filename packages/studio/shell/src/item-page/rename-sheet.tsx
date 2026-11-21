import { Dialog, Field, Input } from "@halonicjs/studio-kit";
import { useEffect, useRef, useState } from "react";

/** The rename sheet's words (microcopy 12.3; HAL-13651). */
export const renameSheetWords = {
  title: (kindName: string) => `Rename ${kindName}`,
  rename: "Rename",
  nameField: "Name",
  nameMissing: "Give it a name.",
} as const;

/** Props for {@link RenameSheet}. */
export interface RenameSheetProps {
  /** The kind, as a word in a sentence: "routine", "collection". */
  readonly kindName: string;
  /** The item's name now; the field starts with it. */
  readonly name: string;
  /** Called with the new name, trimmed, when the user keeps one that differs. */
  readonly onRename: (name: string) => void;
  /** Closes the sheet, after **Rename** or on ✕. */
  readonly onClose: () => void;
}

/**
 * Renaming from an item page's ⋮ on a phone, where the page has no name field
 * (`shell.rename-sheet`): the name in one field and **Rename**, in the kit's form sheet, which
 * closes with ✕ on a phone. **Name** takes the focus with its text selected, as a form sheet
 * focuses its first field (component specs 15.3), so typing replaces the name. An empty name stays open and says what is
 * wrong, read out even while Name has the focus; the same name closes and saves nothing.
 *
 * @example
 * {renaming && <RenameSheet kindName="routine" name={name} onRename={save} onClose={close} />}
 */
export function RenameSheet({ kindName, name, onRename, onClose }: RenameSheetProps) {
  const [draft, setDraft] = useState(name);
  const [problem, setProblem] = useState<string>();
  const nameField = useRef<HTMLInputElement>(null);
  // After the sheet has opened: the kit's sheet gives its title the focus first.
  useEffect(() => {
    nameField.current?.focus();
    nameField.current?.select();
  }, []);
  const confirm = () => {
    const trimmed = draft.trim();
    if (trimmed === "") {
      setProblem(renameSheetWords.nameMissing);
      return;
    }
    if (trimmed !== name) onRename(trimmed);
    onClose();
  };
  return (
    <Dialog
      title={renameSheetWords.title(kindName)}
      size="md"
      form
      confirm={{ label: renameSheetWords.rename, busyLabel: renameSheetWords.rename }}
      onConfirm={confirm}
      onCancel={onClose}
    >
      {/* Enter keeps focus in Name, so its error is read there too (HAL-14489, NS1). */}
      <Field label={renameSheetWords.nameField} error={problem ?? null} announceWhileFocused>
        <Input
          ref={nameField}
          value={draft}
          onChange={(event) => {
            setProblem(undefined);
            setDraft(event.target.value);
          }}
        />
      </Field>
    </Dialog>
  );
}
