import { savedConnectorState } from "@halonicjs/google-setup";
import type { ConnectorFacts } from "@halonicjs/studio-feature-library/api";
import type { GoogleSetupAccount } from "./api.ts";

/**
 * What the account's setup record says, in the library's connector-neutral terms, so the library's
 * status view shows the same state the setup item does. The library never sees a Google detail.
 *
 * An API switched off during a run is not in the record, so `apiOn` stays true here; the run's
 * own problem tells it.
 *
 * @example
 * connectionStateOf(connectorFacts(account)); // "needs-sign-in"
 */
export function connectorFacts(account: GoogleSetupAccount): ConnectorFacts {
  const { record } = account;
  const state = savedConnectorState(record);
  return {
    configured: record.lastSignInAt !== null || state !== null,
    signedIn: record.lastSignInAt !== null && state?.kind !== "needs-sign-in-again",
    secretValid: state?.kind !== "needs-new-secret",
    apiOn: true,
  };
}
