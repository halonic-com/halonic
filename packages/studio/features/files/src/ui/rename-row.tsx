import { Field, Input } from "@halonicjs/studio-kit";
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
  readonly onCancel: (blur: boolean) => void;
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
  // The focus left while Enter's rename was still running: a refusal then closes the field.
  const left = useRef(false);

  async function apply(blur: boolean) {
    if (settled.current) return;
    if (busy) {
      if (blur) left.current = true;
      return;
    }
    if (value === name) {
      settled.current = true;
      return onCancel(blur);
    }
    setBusy(true);
    const refused = await onApply(value, blur);
    setBusy(false);
    if (refused === undefined || blur || left.current) {
      settled.current = true;
      if (refused !== undefined) onCancel(true);
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
          onCancel(false);
        } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          void apply(false);
        }
      }}
    >
      {/* The Field links the sentence to the field (aria-invalid, aria-describedby); the live
          region says it once when it appears. */}
      <div aria-live="assertive" aria-atomic="false">
        <Field label={filesWords.renameLabel(name)} hideLabel error={problem ?? null}>
          <Input
            size="sm"
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
        </Field>
      </div>
    </span>
  );
}
