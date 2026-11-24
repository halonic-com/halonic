import type { UsageStorage } from "./usage-types.ts";

/** Where the nonces of Cloud's signed requests to this scope are kept, each until its time ends. */
const noncePrefix = "nonce:";

/** The most nonces one call drops once they have run out, so a call's work stays bounded. */
const maxDroppedPerCall = 64;

/**
 * Records a signed request's nonce until `keepUntilMs`, in one transaction: `"seen"` when the
 * same key already used it and it hasn't run out, `"new"` otherwise. Nonces that have run out
 * are dropped as calls come, a few at a time, so the store holds about one time window of them.
 *
 * Only a request whose signature already holds reaches this, so nobody but Cloud can fill it.
 */
export function rememberNonce(
  storage: UsageStorage,
  entry: { keyId: string; nonce: string; keepUntilMs: number },
  nowMs: number,
): "new" | "seen" {
  const key = `${noncePrefix}${JSON.stringify([entry.keyId, entry.nonce])}`;
  return storage.transactionSync(() => {
    dropRunOut(storage, nowMs);
    const keptUntil = storage.get<number>(key);
    // `verifyRequest` takes a request up to and including `keepUntilMs`, so the nonce holds then too.
    if (keptUntil !== undefined && keptUntil >= nowMs) return "seen";
    storage.put(key, entry.keepUntilMs);
    return "new";
  });
}

// Walks every live nonce, since the list is ordered by key, not by time; at Cloud's push rate that
// is about one time window of pushes.
function dropRunOut(storage: UsageStorage, nowMs: number): void {
  let dropped = 0;
  for (const [key, keepUntilMs] of storage.list<number>(noncePrefix)) {
    if (dropped >= maxDroppedPerCall) return;
    if (keepUntilMs >= nowMs) continue;
    storage.delete(key);
    dropped += 1;
  }
}
