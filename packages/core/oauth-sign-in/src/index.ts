// The public API of @halonicjs/oauth-sign-in. Everything else in src/ is internal.
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
export {
  type CallbackQuery,
  type NamedErrors,
  readSignInCallback,
  type SignInCallback,
} from "./sign-in-callback.ts";
export { createState, stateMatches } from "./state.ts";
export { classifyTokenAnswer, type TokenAnswer, type TokenAnswerMeaning } from "./token-answer.ts";
export { postTokenForm, tokenRequestTimeoutMs } from "./token-request.ts";
