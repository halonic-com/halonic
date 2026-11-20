// The one way a command opens the Google setup of this computer: the setup
// records and the client secrets, kept in a `google` folder of the profile,
// with the secrets sealed by the profile's `token-key` secret, which is made
// the first time one is sealed.

import { join } from "node:path";
import { FileRecordStore } from "@halonicjs/adapter-fs-node";
import { createTokenStore, madeTokenKey, tokenKeySecret } from "@halonicjs/adapter-token-store";
import {
  type ClientSecretStore,
  clientSecretStore,
  type SetupRecords,
  setupRecords,
} from "@halonicjs/google-setup";
import type { IdGenerator, Secrets, TokenStore } from "@halonicjs/ports";
import { type ProfileEnvironment, profileFolder, tokenFolders } from "@halonicjs/profile";
import { type Clock, randomIds, systemClock } from "@halonicjs/std";
import { chainedSecrets, openSecretStore } from "./secret-host.ts";
import { nodeProfileEnvironment } from "./workspace-runs.ts";

/** What the Google commands use on this computer, so tests can fix the profile folder, the clock and the ids. */
export interface GoogleSetup {
  /** Where the profile folder is; this process's by default. */
  readonly profile?: ProfileEnvironment;
  /** The system clock by default. */
  readonly clock?: Clock;
  /** Makes the account and client refs; random by default. */
  readonly ids?: IdGenerator;
  /**
   * Where `token-key` is read from; the environment, then the profile's
   * secrets file, by default. Without a key there, one is made in the
   * profile's secrets file while no token is sealed yet.
   */
  readonly secrets?: Secrets;
}

/** The Google setup of this computer. */
export interface GoogleHost {
  /** The saved setup progress, one record per Google account. */
  readonly setups: SetupRecords;
  /** The client secrets, sealed. */
  readonly clientSecrets: ClientSecretStore;
  /** The sealed token store: client secrets and refresh tokens. Only the sign-in reads from it. */
  readonly tokens: TokenStore;
  /**
   * Makes sure a secret can be sealed: finds `token-key`, or makes it while
   * no token is sealed yet. Never reads the value out.
   *
   * @throws TokenKeyMissingError when the key is gone but sealed tokens remain
   */
  prepareTokenKey(): Promise<void>;
}

/**
 * The Google setup over the profile's `google` folder. Nothing is created
 * until something is saved.
 *
 * @throws RangeError when `HALONIC_HOME` or the home folder isn't an absolute folder
 */
export function openGoogleHost(setup: GoogleSetup): GoogleHost {
  const profile = setup.profile ?? nodeProfileEnvironment();
  const clock = setup.clock ?? systemClock;
  const ids =
    setup.ids ?? randomIds((count) => crypto.getRandomValues(new Uint8Array(count)), clock);
  const folder = profileFolder(profile);
  const folders = tokenFolders(folder);
  const secrets = madeTokenKey({
    secrets: setup.secrets ?? chainedSecrets(profile.variables, () => profile),
    store: { setIfMissing: (name, value) => openSecretStore(profile).setIfMissing(name, value) },
    tokenRecords: [folders.google, folders.integrationSignIns].map(
      (tokenFolder) => new FileRecordStore(tokenFolder),
    ),
  });
  const googleFolder = join(folder.root, "google");
  const tokens = createTokenStore({
    records: new FileRecordStore(folders.google),
    secrets,
    clock,
  });
  return {
    setups: setupRecords({
      records: new FileRecordStore(join(googleFolder, "setups")),
      clock,
      ids,
    }),
    clientSecrets: clientSecretStore(tokens, ids),
    tokens,
    prepareTokenKey: async () => {
      await secrets.get(tokenKeySecret);
    },
  };
}
