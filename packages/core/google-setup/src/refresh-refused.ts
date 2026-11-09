import type { RefreshRefusal } from "./refresh-answer.ts";
import {
  type RefreshRefusalReason,
  refreshRefusalReasons,
  type SetupRecord,
  type SetupValues,
} from "./setup-record.ts";

/** A change to one record, before it is checked and written. */
export interface RecordUpdate {
  readonly record: SetupRecord;
  readonly changes: Partial<SetupValues>;
}

/**
 * Whether the host may refresh this account's token with the saved client
 * secret. It is `false` while a refused refresh is saved, so a run fails with
 * the connector state instead of asking Google again: no retry loop. Only a
 * new sign-in or an accepted new secret clears it, never the passing of time.
 *
 * The staged-secret check (design 4.3) is the one refresh still allowed after
 * a `client` refusal, because it tests a new secret rather than the refused one.
 *
 * @param record - the account's setup record
 */
export function mayRefresh(record: Pick<SetupValues, "refreshRefused">): boolean {
  // Compared with `null` on purpose: anything else, even `undefined`, blocks.
  return record.refreshRefused === null;
}

/**
 * The reason to save for a refusal. A second `invalid_client` after a
 * `client` refusal can only come from the staged-secret check, since nothing
 * else may refresh then: Google refused a new secret too, so the client is
 * gone (design 5.2). The record says so; the secret itself is never read.
 *
 * @param record - the record of the account whose refresh was refused
 * @param refusal - what Google answered
 */
export function refusalReason(
  record: Pick<SetupValues, "refreshRefused">,
  refusal: RefreshRefusal,
): RefreshRefusalReason {
  if (refusal.kind === "signInRefused") {
    return "sign-in";
  }
  const saved = record.refreshRefused?.reason;
  return saved === "client" || saved === "client-gone" ? "client-gone" : "client";
}

/**
 * The reason that needs more to fix, so a later refusal never downgrades an
 * account: a `client` refusal doesn't turn `client-gone` back into `client`,
 * and doesn't let a new secret clear a `sign-in` refusal.
 */
export function strictestRefusal(
  saved: RefreshRefusalReason | undefined,
  next: RefreshRefusalReason,
): RefreshRefusalReason {
  if (saved === undefined) {
    return next;
  }
  return refreshRefusalReasons.indexOf(saved) > refreshRefusalReasons.indexOf(next) ? saved : next;
}

/**
 * Marks each record with the reason, keeping a stricter saved one. A record
 * that already holds this reason keeps its `at`, so "since when" stays true.
 *
 * @param now - the time to stamp, as `Date.toISOString` writes it
 */
export function refusalMarks(
  records: readonly SetupRecord[],
  reason: RefreshRefusalReason,
  now: string,
): RecordUpdate[] {
  return records.map((record) => {
    const saved = record.refreshRefused;
    const strictest = strictestRefusal(saved?.reason, reason);
    const refreshRefused = saved?.reason === strictest ? saved : { reason: strictest, at: now };
    return { record, changes: { refreshRefused } };
  });
}

/**
 * Clears the refusals an accepted new secret fixes. Only `client`: a revoked
 * refresh token stays revoked whatever the secret is, and a gone client needs
 * a new client and a new sign-in, which `signed-in` clears.
 */
export function newSecretClears(records: readonly SetupRecord[]): RecordUpdate[] {
  return records
    .filter((record) => record.refreshRefused?.reason === "client")
    .map((record) => ({ record, changes: { refreshRefused: null } }));
}
