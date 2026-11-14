import { Button, Dialog, Field, Input, SecretText } from "@halonicjs/studio-kit";
import { type Ref, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import { entryHint, type KeptOn, keptLine, savedOn, secretSaveFailed } from "./secret-words.ts";

/** What a parent can do to the secret field: put the cursor in it. */
export interface SecretFieldHandle {
  /** Moves focus to the input. It does nothing while the field shows "Saved", which has no input. */
  focus(): void;
}

/** Props for {@link SecretField}. */
export interface SecretFieldProps {
  /** When the secret was saved, from the setup record, or `null` while none is. */
  readonly savedAt: string | null;
  readonly keptOn: KeptOn;
  /** Served over plain http: the first save asks first, because the secret travels unencrypted. */
  readonly plainHttp: boolean;
  readonly answering: boolean;
  readonly handle: Ref<SecretFieldHandle>;
  /** Sends the secret to the secret store. It rejects when it can't be saved. */
  readonly onSave: (secret: SecretText) => Promise<void>;
  /** Told whether the input holds unsaved text, so the checklist doesn't move on and drop it. */
  readonly onTyped: (hasText: boolean) => void;
}

/**
 * The client secret, write-only (design 4.1). The input is masked and has no show or copy button.
 * What is typed stays in the input and nowhere else: not in React state, not in a draft. The
 * value becomes a `SecretText` for the one request that saves it, and the input is cleared as soon
 * as that succeeds. Once saved, all Studio shows is "Saved" and the date: never a preview, a
 * length or a hash.
 */
export function SecretField(props: SecretFieldProps) {
  const { savedAt, keptOn, plainHttp, answering, handle, onSave, onTyped } = props;
  const input = useRef<HTMLInputElement>(null);
  const reason = useId();
  // Only whether something is typed, never what, so Save knows if it can go on.
  const [hasText, setHasText] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // The plain-http question is asked on the first save only, not again on **Try again**.
  const [confirmed, setConfirmed] = useState(false);
  useImperativeHandle(handle, () => ({ focus: () => input.current?.focus() }));
  useEffect(() => {
    onTyped(hasText);
  }, [hasText, onTyped]);
  useEffect(
    () => () => {
      onTyped(false);
    },
    [onTyped],
  );

  async function send() {
    const field = input.current;
    const value = field?.value.trim() ?? "";
    if (field === null || value === "" || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await onSave(new SecretText(value));
      field.value = "";
      setHasText(false);
      // A later secret is a new send, so it asks again.
      setConfirmed(false);
    } catch {
      // The typed value stays in the input so the user can try again. The error never repeats it.
      setFailed(true);
      field.focus();
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (!answering || !hasText || busy) return;
    if (plainHttp && !confirmed) setConfirming(true);
    else void send();
  }

  const status =
    savedAt === null ? (
      <span className="text-small text-fg-muted">
        <span aria-hidden="true">○ </span>Not saved
      </span>
    ) : (
      <span className="text-small text-fg-muted">
        <span aria-hidden="true">● </span>Saved<span aria-hidden="true"> · </span>
        <span className="sr-only">, </span>
        {savedOn(savedAt)}
      </span>
    );
  const heading = (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <span aria-hidden="true" className="text-caption text-fg-muted">
        Client secret
      </span>
      {status}
    </div>
  );
  if (savedAt !== null) {
    return (
      <div className="flex flex-col gap-1">
        <span className="sr-only">Client secret</span>
        {heading}
        <p className="text-caption text-fg-subtle">{keptLine(keptOn)}</p>
      </div>
    );
  }

  const unavailableText = answering
    ? "Paste the client secret to save it."
    : "Can't save while the engine isn't answering.";
  const canSave = answering && hasText;
  return (
    <>
      <form
        className="flex flex-col gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        {heading}
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <Field
              label="Client secret"
              hideLabel
              hint={entryHint(keptOn)}
              error={failed ? secretSaveFailed : null}
            >
              <Input
                ref={input}
                type="password"
                autoComplete="new-password"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                data-1p-ignore=""
                data-lpignore="true"
                onChange={(event) => {
                  setHasText(event.target.value.trim() !== "");
                  setFailed(false);
                }}
              />
            </Field>
          </div>
          <Button
            type="submit"
            variant="primary"
            busy={busy}
            busyLabel="Saving…"
            unavailable={canSave ? undefined : { reason }}
          >
            {failed ? "Try again" : "Save secret"}
          </Button>
        </div>
        {canSave ? null : (
          <p id={reason} className="text-small text-fg-muted">
            {unavailableText}
          </p>
        )}
        {failed ? (
          <p role="alert" className="sr-only">
            {secretSaveFailed}
          </p>
        ) : null}
      </form>
      {confirming ? (
        <Dialog
          title="Send the secret without encryption?"
          confirm={{ label: "Save it anyway", variant: "danger", busyLabel: "Saving…" }}
          onConfirm={() => {
            setConfirming(false);
            setConfirmed(true);
            void send();
          }}
          onCancel={() => setConfirming(false)}
          returnFocus={() => input.current}
        >
          <p>
            This page is served over plain http, so anyone on your network could read the secret as
            it is sent. Save it on the computer that runs Halonic instead, or serve Studio over
            https.
          </p>
        </Dialog>
      ) : null}
    </>
  );
}
