import type { Clock } from "@halonicjs/ports";
import {
  type PersonalApp,
  personalAppOf,
  type SetupRecord,
  type SetupValues,
} from "./setup-record.ts";
import { SetupRecordError } from "./setup-record-error.ts";
import type { StepId } from "./setup-step.ts";
import type { StoredSetups } from "./stored-setups.ts";

/**
 * The steps another account's app has already done for a shared client: 1 to
 * 6. Step 3 opens again for an app in *Testing*, because Google lets in only
 * the listed test users, so this address has to be added too (design 3.6).
 */
function stepsDoneBySharedApp(app: PersonalApp): readonly StepId[] {
  const steps: StepId[] = ["project", "apis", "scopes", "client", "credentials"];
  return app.publishing === "testing" ? steps : [...steps, "consent"];
}

/** Whether the app's step 3 is finished: the test user listed, or in production. */
function hasWorkingConsent(app: PersonalApp, values: SetupValues): boolean {
  return app.publishing === "testing"
    ? app.testUserTickedAt !== null
    : values.inProductionTickedAt !== null;
}

/**
 * Whether the setup already has a client of its own. Sharing would replace
 * its client secret ref, so no record would point to that secret any more,
 * and keep a sign-in whose refresh token belongs to the old client. The user
 * starts the setup over first instead.
 */
function hasOwnClient(values: SetupValues): boolean {
  return values.clientId !== null || values.clientSecret !== null || values.lastSignInAt !== null;
}

/**
 * Lets a personal account use the working app of another personal account:
 * `SetupRecords.shareClient`.
 *
 * @throws SetupRecordError `not-found`, `damaged` or `cannot-share`
 */
export async function shareClient(
  stored: StoredSetups,
  clock: Clock,
  accountRef: string,
  fromAccountRef: string,
): Promise<SetupRecord> {
  const values = await stored.readExisting(accountRef);
  const from = await stored.readExisting(fromAccountRef);
  const fromApp = personalAppOf(from);
  // Only a personal account's External app can be shared: a Workspace
  // Internal app doesn't work across organisations (design 3.6).
  const canShare =
    accountRef !== fromAccountRef &&
    values.accountType === "personal" &&
    fromApp !== null &&
    hasWorkingConsent(fromApp, from) &&
    from.clientId !== null &&
    from.clientSecret !== null &&
    from.lastSignInAt !== null &&
    !hasOwnClient(values);
  if (!canShare || fromApp === null) {
    throw new SetupRecordError("cannot-share");
  }
  const now = clock.now().toISOString();
  return stored.write(
    accountRef,
    values,
    {
      projectId: from.projectId,
      inProductionTickedAt: from.inProductionTickedAt,
      personalApp: { publishing: fromApp.publishing, testUserTickedAt: null, sharedApp: true },
      clientId: from.clientId,
      clientSecret: from.clientSecret,
      stepsDone: {
        ...values.stepsDone,
        ...Object.fromEntries(stepsDoneBySharedApp(fromApp).map((step) => [step, now])),
      },
    },
    now,
  );
}
