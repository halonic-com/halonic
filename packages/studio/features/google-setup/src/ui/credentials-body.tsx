import type { SetupStep } from "@halonicjs/google-setup";
import type { SecretText } from "@halonicjs/studio-kit";
import { Callout, CopyButton } from "@halonicjs/studio-kit";
import { useEffect, useRef } from "react";
import type { SecretEntry, SecretReplaceAnswer } from "../api.ts";
import { ClientIdField } from "./client-id-field.tsx";
import { ConsoleLink } from "./console-link.tsx";
import { SecretField, type SecretFieldHandle } from "./secret-field.tsx";

/** Props for {@link CredentialsBody}. */
export interface CredentialsBodyProps {
  readonly step: SetupStep;
  /** The saved client ID, and when the secret was saved: all the record holds of them. */
  readonly clientId: string | null;
  readonly secretSavedAt: string | null;
  readonly entry: SecretEntry;
  /** The account's ref, for the command line that stands in for the field when it can't be shown. */
  readonly accountRef: string;
  readonly answering: boolean;
  readonly onSaveClientId: (clientId: string) => Promise<void>;
  readonly onSaveSecret: (secret: SecretText) => Promise<void>;
  /** Sends a new secret for a saved one, and answers what Google said to it. */
  readonly onReplaceSecret: (secret: SecretText) => Promise<SecretReplaceAnswer>;
  /** The setup hasn't been signed in yet, so a new secret replaces the old one at once. */
  readonly beforeFirstSignIn: boolean;
  /** Google refused the saved secret: the field opens ready for the new one. */
  readonly needsNewSecret: boolean;
  /** Put the cursor in the secret field as the step opens, for a secret pasted somewhere else. */
  readonly focusSecret?: boolean;
  /** Told whether the secret field holds unsaved text. */
  readonly onSecretTyped: (hasText: boolean) => void;
}

/** What stands in for the secret field where it can't be shown, by the reason the host gives. */
function SecretUnavailable({ entry, accountRef }: { entry: SecretEntry; accountRef: string }) {
  if (entry.kind !== "unavailable") return null;
  if (entry.reason === "demo") {
    return (
      <Callout tone="info">
        Connecting Google needs the desktop app or <code>halonic serve</code>.
      </Callout>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <p className="text-body">Save the client secret on the computer that runs Halonic.</p>
      {entry.commandExists ? (
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 break-all text-body text-fg">{`halonic google secret ${accountRef}`}</code>
          <CopyButton text={`halonic google secret ${accountRef}`} label="Copy the command" />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Step 6: the client ID and the client secret. The ID is public and shown in full. The secret
 * goes straight to the secret store through `onSaveSecret`, and only "Saved" is shown after.
 */
export function CredentialsBody(props: CredentialsBodyProps) {
  const { step, entry } = props;
  const secret = useRef<SecretFieldHandle>(null);
  const wantsFocus = props.focusSecret === true && step.id === "credentials";
  useEffect(() => {
    if (wantsFocus) secret.current?.focus();
  }, [wantsFocus]);
  return (
    <div className="flex flex-col gap-3">
      <ClientIdField
        saved={props.clientId}
        answering={props.answering}
        onSave={props.onSaveClientId}
        onSecretPasted={() => secret.current?.focus()}
      />
      {entry.kind === "field" ? (
        <SecretField
          savedAt={props.secretSavedAt}
          keptOn={entry.keptOn}
          plainHttp={entry.plainHttp}
          answering={props.answering}
          handle={secret}
          onSave={props.onSaveSecret}
          onReplace={props.onReplaceSecret}
          beforeFirstSignIn={props.beforeFirstSignIn}
          startReplacing={props.needsNewSecret && props.secretSavedAt !== null}
          clientsLink={<ConsoleLink step={step} page="clients" />}
          onTyped={props.onSecretTyped}
        />
      ) : (
        <SecretUnavailable entry={entry} accountRef={props.accountRef} />
      )}
      {step.id === "credentials" ? (
        <p className="text-small text-fg-muted">
          Closed Google's window before copying the secret? On your client's page in Google Cloud,
          click "Add secret" and copy the new one. <ConsoleLink step={step} page="clients" />
        </p>
      ) : null}
    </div>
  );
}
