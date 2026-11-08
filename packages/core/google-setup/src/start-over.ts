import type { TokenStore } from "@halonicjs/ports";
import type { ClientSecretRemoval, ClientSecretStore } from "./client-secret-store.ts";
import type { SetupRecord } from "./setup-record.ts";
import { SetupRecordError } from "./setup-record-error.ts";
import type { SetupRecords } from "./setup-records.ts";
import { refreshTokenName } from "./store-names.ts";

/** What `startOver` did with the client secret, so Studio can say which case it was. */
export type StartOverSecret =
  | ClientSecretRemoval
  /** The setup had no client secret saved yet. */
  | "none-saved"
  /**
   * The record was damaged, so which secret it used isn't known and none was
   * removed. A secret no record points to is never read again, but Studio
   * tells the user it may still be stored.
   */
  | "unknown";

/** The stores Start over removes from. */
export interface StartOverStores {
  readonly setups: SetupRecords;
  readonly secrets: ClientSecretStore;
  /** Where the account's refresh token is, under `google-account-<accountRef>`. */
  readonly tokens: TokenStore;
}

/**
 * **Start over** (design 3.6): removes the setup record, the account's
 * refresh token and the client secret, unless another account uses the same
 * client. It never talks to Google, so it revokes nothing.
 *
 * The record store and the token store only drop old values when they
 * compact, and copies outside them aren't theirs to remove, so Studio says
 * "Halonic deletes the saved client secret and stops using it" (plan D1),
 * never that it is gone from the computer.
 *
 * @returns what happened to the client secret
 *
 * @example
 * const secret = await startOver({ setups, secrets, tokens }, accountRef);
 * if (secret === "kept-for-other-accounts") showUsedBy(await setups.usingClient(clientRef));
 */
export async function startOver(
  stores: StartOverStores,
  accountRef: string,
): Promise<StartOverSecret> {
  const { setups, tokens } = stores;
  const setup = await readOrDamaged(setups, accountRef);

  // Secrets first and the record last: a crash in between leaves a record
  // whose secret is gone, which Start over can remove again, never a secret
  // that no record points to, except for a damaged record, whose secret
  // stays because its ref can't be trusted.
  let secret: StartOverSecret = "unknown";
  if (setup !== "damaged") {
    secret = await removeClientSecret(stores, setup);
  }
  await tokens.remove(refreshTokenName(accountRef));
  await setups.remove(accountRef);
  return secret;
}

/** The record, `damaged` when it can't be read, or `null` when there is none. */
async function readOrDamaged(
  setups: SetupRecords,
  accountRef: string,
): Promise<SetupRecord | "damaged" | null> {
  try {
    return await setups.read(accountRef);
  } catch (error) {
    if (error instanceof SetupRecordError && error.reason === "damaged") {
      return "damaged";
    }
    throw error;
  }
}

async function removeClientSecret(
  stores: StartOverStores,
  setup: SetupRecord | null,
): Promise<StartOverSecret> {
  if (setup?.clientSecret == null) {
    return "none-saved";
  }
  const { clientRef } = setup.clientSecret;
  const users = await stores.setups.usingClient(clientRef);
  const usedByOthers = users.some((user) => user.accountRef !== setup.accountRef);
  return stores.secrets.removeClientSecret(clientRef, { usedByOthers });
}
