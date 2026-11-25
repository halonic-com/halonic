import type { AccountType } from "./account-type.ts";
import type { ServiceCheckOutcome } from "./check-result.ts";
import type { PersonalPublishing } from "./setup-input.ts";
import { personalAppOf, type SetupValues, type SignInEnding } from "./setup-record.ts";
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
  /** The "*x* is listed under Test users" tick in step 3 was set or cleared. */
  | { readonly kind: "test-user"; readonly ticked: boolean }
  /** **Publish with my own pages** or **Stay in Testing instead** in step 3 (design 3.2). */
  | { readonly kind: "publishing"; readonly publishing: PersonalPublishing }
  /** A valid client ID was saved in step 6. */
  | { readonly kind: "client-id"; readonly clientId: string }
  /** The client secret was saved or replaced; the ref is what the secret store returned. */
  | { readonly kind: "client-secret-saved"; readonly clientRef: string }
  /** The browser was opened for a sign-in. */
  | { readonly kind: "sign-in-started" }
  /** The sign-in was cancelled, timed out or failed: nothing is waiting any more. */
  | { readonly kind: "sign-in-dropped" }
  /** The sign-in came back cancelled, with a refused client secret or blocked by the admin: nothing is waiting any more. */
  | { readonly kind: "sign-in-ended"; readonly ending: SignInEnding }
  /** Google signed in another account than the connector's: nothing was saved and nothing is waiting any more. */
  | { readonly kind: "wrong-account" }
  /** The connector's address was changed, so a wrong-account note about the old one no longer applies. */
  | { readonly kind: "address-changed" }
  /** Google answered the sign-in. It clears a saved refresh refusal. */
  | { readonly kind: "signed-in" }
  /** The "Sign in again" reminder was closed with **Not now**, for this sign-in (design 5.2). */
  | { readonly kind: "reminder-closed" }
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
    case "test-user":
    case "publishing":
      return personalAppEdit(values, edit, now);
    case "client-id":
      return { clientId: edit.clientId };
    case "client-secret-saved":
      return { clientSecret: { clientRef: edit.clientRef, savedAt: now } };
    case "sign-in-started":
      return { signInStartedAt: now, wrongAccountAt: null, lastSignInEnded: null };
    case "sign-in-dropped":
      return { signInStartedAt: null, lastSignInEnded: null };
    case "sign-in-ended":
      return { signInStartedAt: null, lastSignInEnded: { kind: edit.ending, at: now } };
    case "wrong-account":
      return { signInStartedAt: null, wrongAccountAt: now, lastSignInEnded: null };
    case "address-changed":
      return { wrongAccountAt: null };
    case "signed-in":
      // A new refresh token, so a refused refresh no longer applies to this
      // account. Other accounts on the same client sign in themselves.
      return {
        signInStartedAt: null,
        lastSignInAt: now,
        wrongAccountAt: null,
        lastSignInEnded: null,
        refreshRefused: null,
      };
    case "reminder-closed":
      return { reminderClosedAt: now };
    case "service-checked":
      return {
        services: {
          ...values.services,
          [edit.service]: { result: edit.result, checkedAt: now },
        },
      };
  }
}

/**
 * The values a step 3 edit of a personal app changes. A Workspace record has
 * no personal app, so the edit makes no change and the record stays as it
 * is, and choosing the way the app is already published changes nothing.
 * Switching how it is published opens step 3 again (**Edit** on step 3), and
 * going back to *Testing* clears the "In production" tick, so the 7-day
 * sign-in counts again.
 */
function personalAppEdit(
  values: SetupValues,
  edit: Extract<SetupEdit, { kind: "test-user" | "publishing" }>,
  now: string,
): Partial<SetupValues> {
  const app = personalAppOf(values);
  if (app === null) {
    return {};
  }
  if (edit.kind === "test-user") {
    return { personalApp: { ...app, testUserTickedAt: edit.ticked ? now : null } };
  }
  if (edit.publishing === app.publishing) {
    return {};
  }
  const { consent: _reopened, ...stillDone } = values.stepsDone;
  return {
    personalApp: { ...app, publishing: edit.publishing },
    stepsDone: stillDone,
    ...(edit.publishing === "testing" ? { inProductionTickedAt: null } : {}),
  };
}
