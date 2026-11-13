// The public API of @halonicjs/oauth-sign-in. Everything else in src/ is internal.
export {
  type ApprovedSignIn,
  type ApprovedSignInHash,
  approvedSignInHash,
} from "./approved-sign-in.ts";
export {
  type ClientAuth,
  type ClientRequest,
  type OAuthClient,
  withClientAuth,
} from "./client-auth.ts";
export { type CodeExchange, exchangeAuthorizationCode } from "./exchange-code.ts";
export { formBody } from "./form-body.ts";
export { type LoopbackRedirect, loopbackRedirectUri } from "./loopback-redirect.ts";
export { safeOAuthErrorCode } from "./oauth-error-code.ts";
export {
  hasPendingSignInExpired,
  type PendingSignIn,
  type PendingSignInDetails,
  type PendingSignIns,
  pendingSignInLifetimeMs,
} from "./pending-sign-in.ts";
export { createPendingSignIns } from "./pending-sign-ins.ts";
export { createPkcePair, type PkcePair, pkceChallenge } from "./pkce.ts";
export { type RefreshAnswerMeaning, readRefreshAnswer } from "./refresh-answer.ts";
export { type RefreshGrant, type RefreshResult, refreshAccessToken } from "./refresh-grant.ts";
export { type RevokeResult, revokeToken, type TokenRevocation } from "./revoke-token.ts";
export {
  type CallbackQuery,
  type NamedErrors,
  readSignInCallback,
  type SignInCallback,
} from "./sign-in-callback.ts";
export {
  createSignInGrants,
  type GrantLookup,
  type SignInGrant,
  type SignInGrants,
} from "./sign-in-grants.ts";
export { signInTokenName } from "./sign-in-token-name.ts";
export {
  accessTokenMinimumLifeMs,
  createSignInTokens,
  forcedRefreshIntervalMs,
  type ManagedSignInTokens,
  type SignInTokensSettings,
  unknownLifetimeMs,
} from "./sign-in-tokens.ts";
export { type SignOutResult, type SignOutSettings, signOut } from "./sign-out.ts";
export { createState, stateMatches } from "./state.ts";
export { classifyTokenAnswer, type TokenAnswer, type TokenAnswerMeaning } from "./token-answer.ts";
export { maxTokenAnswerBytes, postTokenForm, tokenRequestTimeoutMs } from "./token-request.ts";
export { isUsableToken, maxTokenLength, minTokenLength } from "./usable-token.ts";
