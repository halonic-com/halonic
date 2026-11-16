import { Dialog, Field, Input } from "@halonicjs/studio-kit";
import { useEffect, useRef, useState } from "react";
import type { Identity } from "../api.ts";
import type { ChangesList } from "../changes-list.ts";
import { identityWords } from "../changes-words.ts";

/** Props for {@link IdentityDialog}. */
export interface IdentityDialogProps {
  readonly list: ChangesList;
  /** What is already set, offered in the fields. */
  readonly initial: Identity;
  /** Where focus goes on close when the button that opened it has gone. */
  readonly returnFocus: () => HTMLElement | null;
}

/**
 * Who should versions be from? (checklist part 2, 2.6, T9-F21): shown once before the first
 * Create version of a workspace whose history has no name and email. Save and continue stays
 * pressable: an empty Name or an Email that isn't an address says so under its field and focuses
 * the first of them. Cancel closes Create version as well.
 */
export function IdentityDialog({ list, initial, returnFocus }: IdentityDialogProps) {
  const nameField = useRef<HTMLInputElement>(null);
  const emailField = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email);
  const [nameError, setNameError] = useState<string>();
  const [emailError, setEmailError] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  // The dialog goes with a saved identity; nothing is set on a closed dialog.
  const open = useRef(true);
  useEffect(() => {
    open.current = true;
    return () => {
      open.current = false;
    };
  }, []);

  async function save() {
    if (busy) return;
    setError(undefined);
    setBusy(true);
    const outcome = await list.saveIdentity({ name, email });
    if (!open.current || outcome.kind === "saved") return;
    setBusy(false);
    if (outcome.kind === "failed") {
      setError(`${identityWords.failed}. ${outcome.reason}`);
      return;
    }
    setNameError(outcome.name);
    setEmailError(outcome.email);
    (outcome.name === undefined ? emailField : nameField).current?.focus();
  }

  return (
    <Dialog
      title={identityWords.title}
      size="md"
      form
      confirm={{ label: identityWords.saveAndContinue, busyLabel: identityWords.saving }}
      busy={busy}
      {...(error === undefined ? {} : { error, retryLabel: identityWords.tryAgain })}
      returnFocus={returnFocus}
      onConfirm={() => void save()}
      onCancel={() => list.cancelVersion()}
    >
      <div className="flex flex-col gap-4">
        <p className="text-body">{identityWords.intro}</p>
        <Field label={identityWords.name} error={nameError ?? null}>
          <Input
            ref={nameField}
            value={name}
            autoFocus
            onChange={(event) => {
              setNameError(undefined);
              setName(event.target.value);
            }}
          />
        </Field>
        <Field
          label={identityWords.email}
          hint={identityWords.emailHint}
          error={emailError ?? null}
        >
          <Input
            ref={emailField}
            value={email}
            onChange={(event) => {
              setEmailError(undefined);
              setEmail(event.target.value);
            }}
          />
        </Field>
      </div>
    </Dialog>
  );
}
