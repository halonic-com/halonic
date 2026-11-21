import { type SignOutSettings, signOut } from "@halonicjs/oauth-sign-in";
import { createHttpsOnlyClient } from "./https-only-client.ts";
import type { SignedOutSignIn } from "./sign-in-host.ts";

/** What {@link signOutSavedSignIns} needs: a sign-out's settings and the sign-ins to sign out. */
export interface SavedSignInsSignOut extends SignOutSettings {
  /** The sign-ins with a saved grant, found from the grants, such as with `signInsInTokenNames`. */
  readonly signIns: readonly string[];
}

/**
 * Signs out each of an integration's saved sign-ins, as
 * `SignInHost.signOutAll` does, for a process that runs no refresh of those
 * grants, such as the CLI: each is revoked at the address the person
 * approved, where there is one, and its grant removed also when the revoke
 * fails. The `HttpClient` is made https only here, as the host's is.
 *
 * @example
 * await signOutSavedSignIns({ integration: "acme", signIns: ["acme-account"], grants, http, secrets, requestSignal });
 */
export async function signOutSavedSignIns(
  settings: SavedSignInsSignOut,
): Promise<SignedOutSignIn[]> {
  const overHttps = { ...settings, http: createHttpsOnlyClient(settings.http) };
  const signedOut: SignedOutSignIn[] = [];
  for (const signIn of settings.signIns) {
    signedOut.push({ signIn, result: await signOut(overHttps, signIn) });
  }
  return signedOut;
}
