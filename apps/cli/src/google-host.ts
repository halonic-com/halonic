// The one way a command opens the Google setup of this computer: the setup
// records and the client secrets, kept in a `google` folder of the profile,
// with the secrets sealed by the profile's `token-key` secret.

import { join } from "node:path";
import { FileRecordStore } from "@halonicjs/adapter-fs-node";
import { createTokenStore, tokenKeySecret } from "@halonicjs/adapter-token-store";
import {
  type ClientSecretStore,
  clientSecretStore,
  type SetupRecords,
  setupRecords,
} from "@halonicjs/google-setup";
import type { IdGenerator, Secrets } from "@halonicjs/ports";
import { type ProfileEnvironment, profileFolder } from "@halonicjs/profile";
import { type Clock, randomIds, systemClock } from "@halonicjs/std";
import { chainedSecrets } from "./secret-host.ts";
import { nodeProfileEnvironment } from "./workspace-runs.ts";

/** What the Google commands use on this computer, so tests can fix the profile folder, the clock and the ids. */
export interface GoogleSetup {
  /** Where the profile folder is; this process's by default. */
  readonly profile?: ProfileEnvironment;
  /** The system clock by default. */
  readonly clock?: Clock;
  /** Makes the account and client refs; random by default. */
  readonly ids?: IdGenerator;
  /** Where `token-key` is read from; the environment, then the profile's secrets file, by default. */
  readonly secrets?: Secrets;
}

/** The Google setup of this computer. */
export interface GoogleHost {
  /** The saved setup progress, one record per Google account. */
  readonly setups: SetupRecords;
  /** The client secrets, sealed. */
  readonly clientSecrets: ClientSecretStore;
  /** Whether `token-key` is set, so a secret can be sealed. Never reads the value out. */
  tokenKeyIsSet(): Promise<boolean>;
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
  const secrets = setup.secrets ?? chainedSecrets(profile.variables, () => profile);
  const googleFolder = join(profileFolder(profile).root, "google");
  const tokens = createTokenStore({
    records: new FileRecordStore(join(googleFolder, "tokens")),
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
    tokenKeyIsSet: async () => (await secrets.get(tokenKeySecret)) !== null,
  };
}
