import {
  type CallbackQuery,
  readSignInCallback as readOAuthSignInCallback,
} from "@halonicjs/oauth-sign-in";
import type { PendingSignIn, PendingSignIns } from "./pending-sign-in.ts";

export type { CallbackQuery };

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

/** Google's `error` values that get their own result, besides `access_denied`. */
const googleNamedErrors = {
  admin_policy_enforced: "adminBlocked",
  org_internal: "outsideOrganisation",
} as const;

/**
 * Reads Google's callback in the order agreed in HAL-718 (see
 * `readSignInCallback` in `@halonicjs/oauth-sign-in`), with Google's two
 * named errors.
 *
 * @param query - the callback's query parameters
 * @param pendingSignIns - the server's pending sign-ins
 * @returns what the callback means
 */
export function readSignInCallback(
  query: CallbackQuery,
  pendingSignIns: PendingSignIns,
): SignInCallback {
  const callback = readOAuthSignInCallback(query, pendingSignIns, googleNamedErrors);
  if (callback.kind === "providerError") {
    return { ...callback, kind: "googleError" };
  }
  return callback;
}
