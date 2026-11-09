import type { Clock } from "@halonicjs/ports";
import type { SetupRecord, SetupValues } from "./setup-record.ts";
import { SetupRecordError } from "./setup-record-error.ts";
import type { StepId } from "./setup-step.ts";
import type { StoredSetups } from "./stored-setups.ts";

/** The steps another account's app has already done for a shared client: 1 to 6. */
const stepsDoneBySharedApp = [
  "project",
  "apis",
  "consent",
  "scopes",
  "client",
  "credentials",
] as const satisfies readonly StepId[];

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
  // Only a personal account's External app can be shared: a Workspace
  // Internal app doesn't work across organisations (design 3.6).
  const canShare =
    accountRef !== fromAccountRef &&
    values.accountType === "personal" &&
    from.accountType === "personal" &&
    from.inProductionTickedAt !== null &&
    from.clientId !== null &&
    from.clientSecret !== null &&
    from.lastSignInAt !== null &&
    !hasOwnClient(values);
  if (!canShare) {
    throw new SetupRecordError("cannot-share");
  }
  const now = clock.now().toISOString();
  return stored.write(
    accountRef,
    values,
    {
      projectId: from.projectId,
      inProductionTickedAt: from.inProductionTickedAt,
      clientId: from.clientId,
      clientSecret: from.clientSecret,
      stepsDone: {
        ...values.stepsDone,
        ...Object.fromEntries(stepsDoneBySharedApp.map((step) => [step, now])),
      },
    },
    now,
  );
}
