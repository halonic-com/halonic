import type { Clock } from "@halonicjs/ports";
import type { RefreshRefusal } from "./refresh-answer.ts";
import { newSecretClears, refusalMarks, refusalReason } from "./refresh-refused.ts";
import type { SetupRecord } from "./setup-record.ts";
import type { StoredSetups } from "./stored-setups.ts";

/**
 * Saves a refused token refresh: `SetupRecords.refreshRefused`. The rules for
 * the reason and the marks are in `refresh-refused.ts`; this reads the
 * accounts they apply to and writes the marks in one append.
 */
export async function saveRefreshRefused(
  stored: StoredSetups,
  clock: Clock,
  accountRef: string,
  refusal: RefreshRefusal,
): Promise<SetupRecord[]> {
  const values = await stored.readExisting(accountRef);
  const clientRef = values.clientSecret?.clientRef;
  const sameClient =
    clientRef === undefined ? [{ accountRef, ...values }] : await stored.usingClient(clientRef);
  const reason = refusalReason(values, refusal, sameClient);
  const marked = refusal.kind === "clientRefused" ? sameClient : [{ accountRef, ...values }];
  const now = clock.now().toISOString();
  return stored.writeAll(refusalMarks(marked, reason, now), now);
}

/**
 * Clears a `client` refusal on every account that uses the client:
 * `SetupRecords.clientSecretAccepted`.
 */
export async function clearClientRefusals(
  stored: StoredSetups,
  clock: Clock,
  clientRef: string,
): Promise<SetupRecord[]> {
  const now = clock.now().toISOString();
  return stored.writeAll(newSecretClears(await stored.usingClient(clientRef)), now);
}
