import type { ClientSecretStore } from "@halonicjs/google-setup";
import {
  checkGoogleServicesAgain,
  checkStagedClientSecret,
  createPendingSignIns,
  finishGoogleSignIn,
  revokeGoogleSignIn,
  startGoogleSignIn,
} from "@halonicjs/host-google-sign-in";
import type { GoogleAccountActions } from "@halonicjs/host-server";
import type { Clock, HttpClient, TokenStore } from "@halonicjs/ports";

/** What the actions talk to Google and the profile's stores with. */
export interface GoogleActionPorts {
  http: HttpClient;
  tokens: TokenStore;
  clientSecrets: ClientSecretStore;
  clock: Clock;
}

/**
 * The calls to Google that the routes make, over the sign-in package's own
 * functions. The pending sign-ins live in this host's memory only, so a host
 * that restarts forgets them and a callback that still arrives matches nothing.
 */
export function googleAccountActions(ports: GoogleActionPorts): GoogleAccountActions {
  const { http, tokens, clientSecrets, clock } = ports;
  const pendingSignIns = createPendingSignIns(clock);
  const readClientSecret = (clientRef: string) => clientSecrets.readClientSecret(clientRef);
  return {
    checkStagedSecret: (input) =>
      checkStagedClientSecret(input, {
        http,
        tokens,
        readStagedClientSecret: (clientRef) => clientSecrets.readStagedClientSecret(clientRef),
      }),
    startSignIn: (input) => startGoogleSignIn(input, pendingSignIns),
    dropSignIn: async (accountRef) => pendingSignIns.cancel(accountRef),
    finishSignIn: (query) =>
      finishGoogleSignIn(query, { pendingSignIns, http, tokens, clock, readClientSecret }),
    checkAgain: (input) =>
      checkGoogleServicesAgain(input, { http, tokens, clock, readClientSecret }),
    revoke: (accountRef) => revokeGoogleSignIn(accountRef, { http, tokens }),
  };
}
