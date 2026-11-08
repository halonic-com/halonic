import { safeGoogleErrorCode } from "./google-error-code.ts";
import type { PendingSignIn, PendingSignIns } from "./pending-sign-in.ts";

/** The callback's query string, as `URLSearchParams` gives it. */
export interface CallbackQuery {
  /** The value of a query parameter, or `null` when it is missing. */
  get(name: string): string | null;
}

/**
 * What the callback means. Every kind except `code` is safe to show and to
 * log. `code` holds the authorisation code, a secret: it stays in the host
 * package, which exchanges it at once.
 */
export type SignInCallback =
  | {
      readonly kind: "code";
      readonly code: string;
      readonly pending: PendingSignIn;
    }
  | { readonly kind: "cancelled"; readonly accountRef: string }
  | { readonly kind: "adminBlocked"; readonly accountRef: string }
  | { readonly kind: "outsideOrganisation"; readonly accountRef: string }
  | { readonly kind: "googleError"; readonly accountRef: string; readonly errorCode: string }
  | { readonly kind: "incompleteCallback"; readonly accountRef: string }
  | { readonly kind: "linkNoLongerValid" };

/** Google's `error` values that get their own result. */
const namedErrors = {
  access_denied: "cancelled",
  admin_policy_enforced: "adminBlocked",
  org_internal: "outsideOrganisation",
} as const;

/**
 * Reads Google's callback in the order agreed in HAL-718:
 * 1. Find and remove the pending sign-in by `state`. When none matches, or it
 *    has expired, the result is `linkNoLongerValid` and nothing else is read,
 *    so a forged `error=access_denied` can't cancel a real sign-in.
 * 2. Only then read `error` or `code`. An `error` wins over a `code`.
 *
 * Because the pending sign-in is removed before the code is returned, two
 * callbacks at once can never both exchange it.
 *
 * @param query - the callback's query parameters
 * @param pendingSignIns - the server's pending sign-ins
 * @returns what the callback means
 */
export function readSignInCallback(
  query: CallbackQuery,
  pendingSignIns: PendingSignIns,
): SignInCallback {
  const state = query.get("state");
  if (state === null || state === "") {
    return { kind: "linkNoLongerValid" };
  }
  const pending = pendingSignIns.take(state);
  if (pending === undefined) {
    return { kind: "linkNoLongerValid" };
  }
  const { accountRef } = pending;

  const error = query.get("error");
  if (error !== null) {
    const errorCode = safeGoogleErrorCode(error);
    if (Object.hasOwn(namedErrors, errorCode)) {
      return { kind: namedErrors[errorCode as keyof typeof namedErrors], accountRef };
    }
    return { kind: "googleError", accountRef, errorCode };
  }

  const code = query.get("code");
  if (code === null || code === "") {
    return { kind: "incompleteCallback", accountRef };
  }
  return { kind: "code", code, pending };
}
