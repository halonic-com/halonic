import { Field, Input } from "@halonicjs/studio-kit";
import { useEffect, useRef, useState } from "react";
import type { RenameImpact } from "../files-host.ts";
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
  /** What is wrong with the name typed so far, said under the field as the user types. */
  readonly check: (name: string) => string | undefined;
  /** The places in other files a rename to the typed name would also update. */
  readonly impact: (name: string) => Promise<RenameImpact>;
  /** Escape, or a name left as it was: the row shows the name again. */
  readonly onCancel: (blur: boolean) => void;
}

/** The part of a name to select first: all but the extensions. */
function stemEnd(name: string): number {
  const dot = name.indexOf(".");
  return dot > 0 ? dot : name.length;
}

/** Reads the typed name's effect on other files, and says it only for the newest name. */
function useImpact(
  name: string,
  value: string,
  impact: RenameRowProps["impact"],
  blocked: boolean,
): string | undefined {
  const [line, setLine] = useState<string>();
  useEffect(() => {
    setLine(undefined);
    if (blocked || value === name) return;
    let stopped = false;
    impact(value).then(
      ({ places, owners }) => {
        if (!stopped && places > 0) setLine(filesWords.alsoUpdates(places, owners));
      },
      // The line is a help: a rename that can't be looked at ahead is still tried on Enter.
      () => {},
    );
    return () => {
      stopped = true;
    };
  }, [name, value, impact, blocked]);
  return line;
}

/**
 * The name of a file edited in its tree row (`files.ui.rename-file`): Enter or leaving the row
 * applies it, Escape puts the old name back. The name is checked as it is typed, and a name the host refuses is
 * said under the row; the field stays, with the typed name, also after the focus left it.
 */
export function RenameRow({ name, onApply, check, impact, onCancel }: RenameRowProps) {
  const [value, setValue] = useState(name);
  // A sentence from the host's refusal; the typed name's own problem is read from `check`.
  const [refused, setRefused] = useState<string>();
  const typed = check(value);
  const problem = typed ?? refused;
  const alsoUpdates = useImpact(name, value, impact, problem !== undefined);
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
    const answer = await onApply(value, () => blur || left.current);
    setBusy(false);
    if (answer === undefined) {
      settled.current = true;
      return;
    }
    // Also when the focus left: the row keeps the typed name, and the toast offers Try again.
    left.current = false;
    setRefused(answer);
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
          region says it once when it appears, politely: focus is on the field, so it can reach it. */}
      <div aria-live="polite" aria-atomic="false">
        <Field
          label={filesWords.renameLabel(name)}
          hideLabel
          error={problem ?? null}
          {...(alsoUpdates === undefined ? {} : { hint: alsoUpdates })}
        >
          <Input
            size="sm"
            autoFocus
            readOnly={busy}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setRefused(undefined);
            }}
            onFocus={(event) => event.target.setSelectionRange(0, stemEnd(event.target.value))}
            onBlur={() => void apply(true)}
          />
        </Field>
      </div>
    </span>
  );
}
