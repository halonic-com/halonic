// What a host tells the person after Remove trust or removing a plugin
// signed out its sign-ins (`app.plugin-sign-out`).

import type { PluginSignedOut } from "./plugin-service-types.ts";

/**
 * The sign-ins of `signedOut` whose grant was there and is gone now.
 *
 * @example
 * signInsSignedOut(await plugins.revoke("acme")); // ["acme-account"]
 */
export function signInsSignedOut(signedOut: readonly PluginSignedOut[]): string[] {
  return signedOut.filter(({ result }) => result.kind === "signedOut").map(({ signIn }) => signIn);
}

/**
 * The sign-ins of `signedOut` whose token may still work at the provider
 * until it expires: those the provider didn't confirm, or that had no
 * address to revoke at, as Studio's **Sign out** tells the person.
 *
 * @example
 * signInsNotConfirmed(await plugins.revoke("acme")); // ["acme-account"] when the provider didn't answer
 */
export function signInsNotConfirmed(signedOut: readonly PluginSignedOut[]): string[] {
  return signedOut
    .filter(({ result }) => result.kind === "signedOut" && !revokeConfirmed(result.revoke))
    .map(({ signIn }) => signIn);
}

/** A `skipped` revoke left a newer grant alone on purpose, so nothing is left to say. */
function revokeConfirmed(revoke: "revoked" | "notConfirmed" | "noRevokeUrl" | "skipped"): boolean {
  return revoke === "revoked" || revoke === "skipped";
}
