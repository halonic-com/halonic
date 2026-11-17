import { Field, Input } from "@halonicjs/studio-kit";
import { useEffect, useRef, useState } from "react";
import { filesWords } from "../files-words.ts";

/** The props of {@link RenameRow}. */
export interface RenameRowProps {
  /** The file's name now, the last part of its path. */
  readonly name: string;
  /**
   * Applies the typed name. Resolves to the sentence that says why not, which stays under the row
   * while the name is edited; `left` says whether the focus has left the row, which can happen
   * while the host works, so read it when the answer comes.
   */
  readonly onApply: (name: string, left: () => boolean) => Promise<string | undefined>;
  /** What is wrong with the typed name, checked on every key (microcopy 7, FL14). */
  readonly check: (name: string) => string | undefined;
  /** The line "Also updates 3 places: …" for the typed name, or nothing; asked a moment after typing stops. */
  readonly impact: (name: string) => Promise<string | undefined>;
  /** Escape, or a name left as it was: the row shows the name again. */
  readonly onCancel: (blur: boolean) => void;
}

/** How long after the last key the places a rename would change are asked for, in milliseconds. */
export const impactDelayMs = 200;

/** The part of a name to select first: all but the extensions. */
function stemEnd(name: string): number {
  const dot = name.indexOf(".");
  return dot > 0 ? dot : name.length;
}

/**
 * The name of a file edited in its tree row (`files.ui.rename-file`): Enter or leaving the row
 * applies it, Escape puts the old name back. The typed name is checked on every key and the problem
 * is said under the row; a name the host refuses is said there too, and the field stays, also
 * when the focus has left (the sidebar's toast then offers Try again).
 */
export function RenameRow({ name, onApply, check, impact, onCancel }: RenameRowProps) {
  const [value, setValue] = useState(name);
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [places, setPlaces] = useState<string>();
  const settled = useRef(false);
  // `busy` is state and lags a draw behind: a second blur in the same turn must see the rename running.
  const running = useRef(false);
  // The focus left while Enter's rename was still running: a refusal then closes the field.
  const left = useRef(false);

  const typed = value === name ? undefined : check(value);
  // The parent builds these on every draw; the effect below must not start over for that.
  const asking = useRef({ check, impact });
  asking.current = { check, impact };

  // The places the rename would change, said once the typing pauses; a slower answer for an
  // older name is dropped.
  useEffect(() => {
    setPlaces(undefined);
    if (value === name || asking.current.check(value) !== undefined) return;
    let stopped = false;
    const timer = setTimeout(() => {
      void asking.current.impact(value).then((line) => {
        if (!stopped) setPlaces(line);
      });
    }, impactDelayMs);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [value, name]);

  async function apply(blur: boolean) {
    if (settled.current) return;
    if (running.current) {
      if (blur) left.current = true;
      return;
    }
    if (value === name) {
      settled.current = true;
      return onCancel(blur);
    }
    // Enter with a name that is already known to be wrong keeps the field and its sentence.
    if (!blur && typed !== undefined) return;
    running.current = true;
    setBusy(true);
    const refused = await onApply(value, () => blur || left.current);
    running.current = false;
    setBusy(false);
    if (refused === undefined) {
      settled.current = true;
      return;
    }
    left.current = false;
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
          region says it once when it appears, politely: focus is in the field, which reads it
          (microcopy 19.1). A refusal after the focus left is the sidebar's toast. */}
      <div aria-live="polite" aria-atomic="false">
        <Field
          label={filesWords.renameLabel(name)}
          hideLabel
          error={typed ?? problem ?? null}
          hint={places}
        >
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
