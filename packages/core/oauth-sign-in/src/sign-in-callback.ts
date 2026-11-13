import { safeOAuthErrorCode } from "./oauth-error-code.ts";
import type { PendingSignIn, PendingSignInDetails, PendingSignIns } from "./pending-sign-in.ts";

/** The callback's query string, as `URLSearchParams` gives it. */
export interface CallbackQuery {
  /** The value of a query parameter, or `null` when it is missing. */
  get(name: string): string | null;
}

/**
 * What the callback means. Every kind except `code` is safe to show and to
 * log. `code` holds the authorisation code, a secret: it stays in the host
 * package, which exchanges it at once.
 *
 * `Named` is the kinds a provider gives its own error codes (see
 * {@link NamedErrors}).
 */
export type SignInCallback<
  Details extends PendingSignInDetails = PendingSignInDetails,
  Named extends string = never,
> =
  | {
      readonly kind: "code";
      readonly code: string;
      readonly pending: PendingSignIn<Details>;
    }
  | { readonly kind: "cancelled" | Named; readonly accountRef: string }
  | { readonly kind: "providerError"; readonly accountRef: string; readonly errorCode: string }
  | { readonly kind: "incompleteCallback"; readonly accountRef: string }
  | { readonly kind: "linkNoLongerValid" };

/**
 * The `error` values a provider gives their own result kind, by code. Only
 * `access_denied` is standard (RFC 6749, section 4.1.2.1): it is always
 * `cancelled`. Anything else the provider names, such as Google's
 * `org_internal`, comes in through this table.
 */
export type NamedErrors<Named extends string> = Readonly<Record<string, Named>>;

/**
 * Reads the provider's callback in the order agreed in HAL-718:
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
 * @param namedErrors - the provider's own error codes and the result kind each gets
 * @returns what the callback means
 */
export function readSignInCallback<
  Details extends PendingSignInDetails,
  Named extends string = never,
>(
  query: CallbackQuery,
  pendingSignIns: PendingSignIns<Details>,
  namedErrors: NamedErrors<Named> = {},
): SignInCallback<Details, Named> {
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
    const errorCode = safeOAuthErrorCode(error);
    if (errorCode === "access_denied") {
      return { kind: "cancelled", accountRef };
    }
    const named = Object.hasOwn(namedErrors, errorCode) ? namedErrors[errorCode] : undefined;
    if (named !== undefined) {
      return { kind: named, accountRef };
    }
    return { kind: "providerError", accountRef, errorCode };
  }

  const code = query.get("code");
  if (code === null || code === "") {
    return { kind: "incompleteCallback", accountRef };
  }
  return { kind: "code", code, pending };
}
