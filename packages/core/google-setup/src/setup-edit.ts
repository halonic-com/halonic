import type { AccountType } from "./account-type.ts";
import type { ServiceCheckOutcome } from "./check-result.ts";
import type { SetupValues } from "./setup-record.ts";
import type { StepId } from "./setup-step.ts";

/**
 * One change to a setup record, named after what happened. These are the
 * only ways a record changes after it is started, and none of them carries a
 * secret: the client secret goes to the `ClientSecretStore`, and only its
 * ref comes here.
 */
export type SetupEdit =
  /** The user changed the account type in the item header (design 2.3). */
  | { readonly kind: "account-type"; readonly accountType: AccountType }
  /** The project ID from step 1, or `null` when the user cleared it. */
  | { readonly kind: "project-id"; readonly projectId: string | null }
  /** A step was finished: **Done, next**, or a state Studio knows (steps 5–7). */
  | { readonly kind: "step-done"; readonly step: StepId }
  /** A step is open again, because it gained something (design 3.6). */
  | { readonly kind: "step-reopened"; readonly step: StepId }
  /** The "In production" tick in step 3 was set or cleared. */
  | { readonly kind: "in-production"; readonly ticked: boolean }
  /** A valid client ID was saved in step 6. */
  | { readonly kind: "client-id"; readonly clientId: string }
  /** The client secret was saved or replaced; the ref is what the secret store returned. */
  | { readonly kind: "client-secret-saved"; readonly clientRef: string }
  /** The browser was opened for a sign-in. */
  | { readonly kind: "sign-in-started" }
  /** The sign-in was cancelled, timed out or failed: nothing is waiting any more. */
  | { readonly kind: "sign-in-dropped" }
  /** Google answered the sign-in. It clears a saved refresh refusal. */
  | { readonly kind: "signed-in" }
  /** The check after sign-in for one service (design 3.5, plan D5 rev. 5). */
  | {
      readonly kind: "service-checked";
      readonly service: string;
      readonly result: ServiceCheckOutcome;
    };

/**
 * The values an edit changes, stamped with `now`. The caller merges them
 * into the record and checks the result before anything is written.
 *
 * @param values - the record as it is
 * @param edit - what happened
 * @param now - the time to stamp, as `Date.toISOString` writes it
 */
export function editedValues(
  values: SetupValues,
  edit: SetupEdit,
  now: string,
): Partial<SetupValues> {
  switch (edit.kind) {
    case "account-type":
      return { accountType: edit.accountType };
    case "project-id":
      return { projectId: edit.projectId };
    case "step-done":
      return { stepsDone: { ...values.stepsDone, [edit.step]: now } };
    case "step-reopened": {
      const { [edit.step]: _reopened, ...stillDone } = values.stepsDone;
      return { stepsDone: stillDone };
    }
    case "in-production":
      return { inProductionTickedAt: edit.ticked ? now : null };
    case "client-id":
      return { clientId: edit.clientId };
    case "client-secret-saved":
      return { clientSecret: { clientRef: edit.clientRef, savedAt: now } };
    case "sign-in-started":
      return { signInStartedAt: now };
    case "sign-in-dropped":
      return { signInStartedAt: null };
    case "signed-in":
      // A new refresh token, so a refused refresh no longer applies to this
      // account. Other accounts on the same client sign in themselves.
      return { signInStartedAt: null, lastSignInAt: now, refreshRefused: null };
    case "service-checked":
      return {
        services: {
          ...values.services,
          [edit.service]: { result: edit.result, checkedAt: now },
        },
      };
  }
}
