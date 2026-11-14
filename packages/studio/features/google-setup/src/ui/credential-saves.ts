import type { SetupEdit, StepId } from "@halonicjs/google-setup";
import type { SecretText } from "@halonicjs/studio-kit";
import type { GoogleSetupAccount } from "../api.ts";

/** A step tick that failed after its save went through, and how to run it again. */
export interface ProgressFailure {
  readonly error: unknown;
  readonly retry: () => void;
}

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
 * A retry ticks only the steps that hadn't been ticked when it failed, not the ones before.
 *
 * @param onProgress - told when a step couldn't be ticked, with the error and a retry, and told
 *   `null` once the ticks have gone through
 */
export function credentialSaves(
  account: GoogleSetupAccount,
  onEdit: (edit: SetupEdit) => Promise<void>,
  send: (secret: SecretText) => Promise<void>,
  onProgress: (failure: ProgressFailure | null) => void,
): CredentialSaves {
  const { record } = account;
  const finish = async (steps: readonly StepId[]): Promise<void> => {
    for (const [index, step] of steps.entries()) {
      if (record.stepsDone[step] !== undefined) continue;
      try {
        await onEdit({ kind: "step-done", step });
      } catch (error) {
        const rest = steps.slice(index);
        onProgress({ error, retry: () => void finish(rest) });
        return;
      }
    }
    onProgress(null);
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
