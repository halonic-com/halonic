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
 * A save that went through has gone through, even when the tick after it fails: the returned
 * save then resolves, and the failed tick goes to `onProgressFailed` with a way to run it again.
 * Only a failed save rejects, so the field can say that nothing was saved.
 *
 * @param account - the account as the host has it now
 * @param onEdit - saves one change to the setup record
 * @param send - saves the secret to the secret store, then lets the host tell its listeners
 * @param onProgressFailed - told when a step couldn't be ticked, with the error and a retry
 */
export function credentialSaves(
  account: GoogleSetupAccount,
  onEdit: (edit: SetupEdit) => Promise<void>,
  send: (secret: SecretText) => Promise<void>,
  onProgressFailed: (error: unknown, retry: () => void) => void,
): CredentialSaves {
  const { record } = account;
  const finish = async (steps: readonly StepId[]): Promise<void> => {
    try {
      for (const step of steps) {
        if (record.stepsDone[step] === undefined) await onEdit({ kind: "step-done", step });
      }
    } catch (error) {
      onProgressFailed(error, () => void finish(steps));
    }
  };
  return {
    async saveClientId(clientId) {
      await onEdit({ kind: "client-id", clientId });
      await finish(record.clientSecret === null ? ["client"] : ["client", "credentials"]);
    },
    async saveSecret(secret) {
      await send(secret);
      if (record.clientId !== null) await finish(["credentials"]);
    },
  };
}
