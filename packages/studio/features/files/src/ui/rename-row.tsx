import { Input } from "@halonicjs/studio-kit";
import { useRef, useState } from "react";
import { filesWords } from "../files-words.ts";

/** The props of {@link RenameRow}. */
export interface RenameRowProps {
  /** The file's name now, the last part of its path. */
  readonly name: string;
  /**
   * Applies the typed name. Resolves to the sentence that says why not, which stays under the row
   * while the name is edited; `blur` says the focus left the row rather than Enter was pressed.
   */
  readonly onApply: (name: string, blur: boolean) => Promise<string | undefined>;
  /** Escape, or a name left as it was: the row shows the name again. */
  readonly onCancel: () => void;
}

/** The part of a name to select first: all but the extensions. */
function stemEnd(name: string): number {
  const dot = name.indexOf(".");
  return dot > 0 ? dot : name.length;
}

/**
 * The name of a file edited in its tree row (`files.ui.rename-file`): Enter or leaving the row
 * applies it, Escape puts the old name back. A name the host refuses is said under the row, and
 * the field stays.
 */
export function RenameRow({ name, onApply, onCancel }: RenameRowProps) {
  const [value, setValue] = useState(name);
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  const settled = useRef(false);

  async function apply(blur: boolean) {
    if (settled.current || busy) return;
    if (value === name) {
      settled.current = true;
      return onCancel();
    }
    setBusy(true);
    const refused = await onApply(value, blur);
    setBusy(false);
    if (refused === undefined || blur) {
      settled.current = true;
      if (refused !== undefined) onCancel();
      return;
    }
    setProblem(refused);
  }

  return (
    // The tree's keys and clicks stay out of the field.
    // biome-ignore lint/a11y/noStaticElementInteractions: it only stops events reaching the tree
    <span
      className="min-w-0 flex-1"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          settled.current = true;
          onCancel();
        } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          void apply(false);
        }
      }}
    >
      <Input
        size="sm"
        aria-label={filesWords.renameLabel(name)}
        autoFocus
        readOnly={busy}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setProblem(undefined);
        }}
        onFocus={(event) => event.target.setSelectionRange(0, stemEnd(event.target.value))}
        onBlur={() => void apply(true)}
      />
      {problem !== undefined && (
        <span role="alert" className="block py-0.5 text-xs text-danger">
          {problem}
        </span>
      )}
    </span>
  );
}
