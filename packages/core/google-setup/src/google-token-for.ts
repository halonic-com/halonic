import type { SetupRecords } from "./setup-records.ts";
import { refreshTokenName } from "./store-names.ts";

/** Where a Google connector's run finds its sign-in: the account and the name its token is kept under. */
export interface GoogleTokenLocation {
  /** The account ref of the connector's setup record. */
  readonly accountRef: string;
  /** The token store name of the account's refresh token. */
  readonly tokenName: string;
}

/**
 * Finds the sign-in a Google connector runs with, through the setup record
 * that points at the connector. The connector file's `account` e-mail is
 * never used for this, and neither is another workspace's record: both the
 * workspace and the id must match.
 *
 * @returns `null` when the connector has no setup, so the run reports it as
 *   not signed in instead of guessing an account
 */
export async function googleTokenFor(
  setups: Pick<SetupRecords, "forConnector">,
  connector: { readonly workspace: string; readonly id: string },
): Promise<GoogleTokenLocation | null> {
  const record = await setups.forConnector(connector.workspace, connector.id);
  if (record === null) {
    return null;
  }
  return { accountRef: record.accountRef, tokenName: refreshTokenName(record.accountRef) };
}
