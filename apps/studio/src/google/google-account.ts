import {
  accountTypeFromAddress,
  type SetupRecord,
  type SetupService,
} from "@halonicjs/google-setup";
import type { GoogleSetupAccount } from "@halonicjs/studio-feature-google-setup/api";

/** What one account's view is built from. */
export interface GoogleAccountParts {
  /** The address in the connector file. */
  readonly email: string;
  readonly record: SetupRecord;
  /** The services of the workspace's sheets that ask for Google scopes. */
  readonly services: readonly SetupService[];
  /** The addresses of the other accounts of this workspace that use the same client. */
  readonly clientSharedWith: readonly string[];
}

/**
 * One Google account as the setup feature reads it. Before the first sign-in every service is
 * part of the setup. After it, a service with no check result was ticked later: it is `adding`
 * and needs its own steps. Routines on hold are not counted yet: the desktop app doesn't see the
 * runs the engine held, so the count is 0 rather than a guess.
 *
 * `askAccountType` is true for an address Studio can't tell, until the setup has any progress:
 * the record keeps no answer of its own, and a person who went on past the first question has
 * answered it.
 */
export function googleAccountOf(parts: GoogleAccountParts): GoogleSetupAccount {
  const { email, record, services, clientSharedWith } = parts;
  const checked = services.filter(({ id }) => record.services[id] !== undefined);
  const signedIn = record.lastSignInAt !== null && checked.length > 0;
  return {
    email,
    record,
    services: signedIn ? checked : services,
    adding: signedIn ? services.filter(({ id }) => record.services[id] === undefined) : [],
    routinesOnHold: 0,
    changedAt: changedAt(record),
    askAccountType: accountTypeFromAddress(email) === undefined && !hasProgress(record),
    clientSharedWith,
  };
}

function hasProgress(record: SetupRecord): boolean {
  return record.projectId !== null || Object.keys(record.stepsDone).length > 0;
}

/** The latest time the record holds, as an ISO time (they sort as text). */
function changedAt(record: SetupRecord): string {
  const times = [
    record.startedAt,
    record.signInStartedAt,
    record.lastSignInAt,
    record.refreshRefused?.at,
    ...Object.values(record.stepsDone),
    ...Object.values(record.services).map(({ checkedAt }) => checkedAt),
  ].filter((time): time is string => typeof time === "string");
  return times.sort().at(-1) ?? record.startedAt;
}
