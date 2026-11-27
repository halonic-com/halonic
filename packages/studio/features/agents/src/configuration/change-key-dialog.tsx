import { Dialog, Field, Input, SecretText } from "@halonicjs/studio-kit";
import { errorReasonFor } from "@halonicjs/studio-shell";
import { useId, useRef, useState } from "react";
import type { ConnectorKeys } from "../api.ts";
import { connectorKeyWords as words } from "./connector-key-words.ts";

/** The props of {@link ChangeKeyDialog}. */
export interface ChangeKeyDialogProps {
  readonly keys: ConnectorKeys;
  /** The secret's name, as the connector's file gives it. */
  readonly secretName: string;
  /** Called once the new key is stored. */
  readonly onChanged: () => void;
  readonly onCancel: () => void;
}

/**
 * Asks before a connector's key is replaced (flow-agents 5.2, save model 8.2): the key isn't
 * versioned, so every agent that uses it switches at once. The question is the Dialog's title and
 * body, so it's read before **Change key** stores anything. The typed key lives in the field only,
 * and becomes a `SecretText` for the one request that stores it.
 */
export function ChangeKeyDialog({ keys, secretName, onChanged, onCancel }: ChangeKeyDialogProps) {
  const input = useRef<HTMLInputElement>(null);
  const bodyId = useId();
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string>();

  async function change() {
    if (busy) return;
    const value = input.current?.value.trim() ?? "";
    if (value === "") {
      setMissing(true);
      input.current?.focus();
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await keys.change(secretName, new SecretText(value));
      onChanged();
    } catch (failure) {
      // The key is taken out of the reason, in case the error repeats it.
      setError(words.saveFailed(errorReasonFor(failure, "").split(value).join("")));
      setBusy(false);
    }
  }

  return (
    <Dialog
      form
      title={words.changeTitle(secretName)}
      describedBy={bodyId}
      confirm={{ label: words.changeKey, busyLabel: words.saving }}
      busy={busy}
      {...(error !== undefined && { error })}
      onConfirm={() => void change()}
      onCancel={onCancel}
    >
      <p id={bodyId}>{words.changeBody}</p>
      <Field label={words.keyLabel} error={missing ? words.pasteFirst : null}>
        <Input
          ref={input}
          type="password"
          autoComplete="new-password"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          data-1p-ignore=""
          data-lpignore="true"
          placeholder={words.keyPlaceholder}
          onChange={(event) => {
            if (event.target.value.trim() !== "") setMissing(false);
          }}
        />
      </Field>
    </Dialog>
  );
}
