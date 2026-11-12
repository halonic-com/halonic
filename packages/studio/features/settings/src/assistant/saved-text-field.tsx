import { Field, Input, isComposing, TextArea } from "@halonicjs/studio-kit";
import { useState } from "react";
import type { FieldCheck } from "./assistant-checks.ts";

/** The props of {@link SavedTextField}. */
export interface SavedTextFieldProps<Value> {
  readonly label: string;
  readonly hint?: string;
  readonly placeholder?: string;
  /** The saved value as text. */
  readonly stored: string;
  /** Checks what was typed when the person leaves the field. */
  readonly check: (text: string) => FieldCheck<Value>;
  /** Saves a checked value; resolves to whether it saved. */
  readonly save: (value: Value) => Promise<boolean>;
  /** The line to show when the last save failed. */
  readonly saveError: string | null;
  /** Several lines that grow to 12, instead of one. */
  readonly multiline?: boolean;
}

/**
 * A typed Assistant field: it checks and saves when you leave it (Enter in a one-line field too).
 * Under an error nothing is saved, and the text stays, so you can fix or retry it
 * (`settings.ai-agent-fields`, flow-settings 3.3).
 */
export function SavedTextField<Value>({
  label,
  hint,
  placeholder,
  stored,
  check,
  save,
  saveError,
  multiline = false,
}: SavedTextFieldProps<Value>) {
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const shown = draft ?? stored;

  async function commit() {
    if (draft === undefined) return;
    const checked = check(draft);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setError(null);
    if (await save(checked.value)) setDraft(undefined);
  }

  const common = {
    value: shown,
    placeholder,
    onChange: (event: { target: { value: string } }) => setDraft(event.target.value),
    onBlur: () => {
      void commit();
    },
  };
  return (
    <Field label={label} hint={hint} error={error ?? saveError}>
      {multiline ? (
        <TextArea {...common} maxRows={12} />
      ) : (
        <Input
          {...common}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !isComposing(event)) void commit();
          }}
        />
      )}
    </Field>
  );
}
