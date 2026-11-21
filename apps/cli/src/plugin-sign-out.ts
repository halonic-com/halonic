// How `halonic trust --plugin <id> --remove` and `halonic plugin remove` sign
// out a plugin's sign-ins on this computer (`app.plugin-sign-out`): the CLI
// runs no refresh of them, so it signs out the grants in the profile itself.

import { FileRecordStore } from "@halonicjs/adapter-fs-node";
import { createNodeHttpClient } from "@halonicjs/adapter-http-node";
import { createTokenStore, storedTokenNames } from "@halonicjs/adapter-token-store";
import { pluginSecretName, type SignOutPlugin } from "@halonicjs/app";
import { signOutSavedSignIns } from "@halonicjs/host-integration-sign-in";
import {
  createSignInGrants,
  signInsInTokenNames,
  tokenRequestTimeoutMs,
} from "@halonicjs/oauth-sign-in";
import type { HttpClient, Secrets } from "@halonicjs/ports";
import { type ProfileFolder, tokenFolders } from "@halonicjs/profile";
import type { Clock } from "@halonicjs/std";
import { proxySetting } from "./proxy-setting.ts";
import { webCryptoDigest } from "./workspace-runs.ts";

/** What {@link cliPluginSignOut} reads and talks to. */
export interface CliPluginSignOutOptions {
  readonly profile: ProfileFolder;
  /** The CLI's secrets, where the token key and a plugin's own secrets are read, as `plugin__<id>__<secret>`. */
  readonly secrets: Secrets;
  readonly clock: Clock;
  /** Talks to the providers; the Node client for public hosts, without redirects, by default. */
  readonly http?: HttpClient;
}

/**
 * Signs out every sign-in of a plugin that has a grant in the profile's
 * `integration-sign-ins` folder, found from the grants themselves: each is
 * revoked at the address the person approved, with the plugin's own client
 * secret where the CLI has it, and its grant removed also when the revoke
 * fails. A plugin with no grant reads no token key.
 *
 * @example
 * new PluginService({ ..., signOut: cliPluginSignOut({ profile, secrets, clock }) });
 */
export function cliPluginSignOut(options: CliPluginSignOutOptions): SignOutPlugin {
  return async (plugin) => {
    const records = new FileRecordStore(tokenFolders(options.profile).integrationSignIns);
    const signIns = signInsInTokenNames(plugin, await storedTokenNames(records));
    if (signIns.length === 0) return;
    const tokens = createTokenStore({ records, secrets: options.secrets, clock: options.clock });
    await signOutSavedSignIns({
      integration: plugin,
      signIns,
      grants: createSignInGrants(tokens, webCryptoDigest),
      http:
        options.http ??
        createNodeHttpClient({ hostClass: () => "public", maxRedirects: 0, proxy: proxySetting }),
      secrets: { get: (name) => options.secrets.get(pluginSecretName(plugin, name)) },
      requestSignal: () => AbortSignal.timeout(tokenRequestTimeoutMs),
    });
  };
}
