import type { SetupEdit, StepId } from "@halonicjs/google-setup";
import type { SecretText } from "@halonicjs/studio-kit";
import type { GoogleSetupAccount } from "../api.ts";

/** What step 6 saves, and the steps each save finishes. */
export interface CredentialSaves {
  /** Saves the client ID. It finishes step 5, and step 6 too when the secret is already saved. */
  readonly saveClientId: (clientId: string) => Promise<void>;
  /** Sends the secret to the secret store. It finishes step 6 when the client ID is saved. */
  readonly saveSecret: (secret: SecretText) => Promise<void>;
}

/**
 * The saves of step 6 and the ticks they bring (UX checklist section 3). A step is ticked only
 * once, so saving a changed client ID later doesn't move the time it was finished. The secret
 * goes to `send` and nowhere else: no edit, and so no record, ever holds it.
 *
 * @param account - the account as the host has it now
 * @param onEdit - saves one change to the setup record
 * @param send - saves the secret to the secret store, then lets the host tell its listeners
 */
export function credentialSaves(
  account: GoogleSetupAccount,
  onEdit: (edit: SetupEdit) => Promise<void>,
  send: (secret: SecretText) => Promise<void>,
): CredentialSaves {
  const { record } = account;
  const finish = async (step: StepId) => {
    if (record.stepsDone[step] === undefined) await onEdit({ kind: "step-done", step });
  };
  return {
    async saveClientId(clientId) {
      await onEdit({ kind: "client-id", clientId });
      await finish("client");
      if (record.clientSecret !== null) await finish("credentials");
    },
    async saveSecret(secret) {
      await send(secret);
      if (record.clientId !== null) await finish("credentials");
    },
  };
}
