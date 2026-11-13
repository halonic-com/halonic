// The public API of @halonicjs/testing-sign-in: a fake OAuth provider and a rig that wires the
// host's sign-in code and the kit's loader to it. Attack tests T1 to T22 use both.
export { clientSecretName, exampleSheetRecord, signInName } from "./example-sheet.ts";
export {
  type BrowserChoice,
  createFakeOAuthServer,
  type FakeOAuthServer,
  type FakeOAuthServerOptions,
  type HostHandler,
} from "./fake-oauth-server.ts";
export { followingRedirects } from "./following-client.ts";
export type { Grant, IssuedCode } from "./grant-ledger.ts";
export { type ProviderBehavior, type TokenKind, wellBehaved } from "./provider-behavior.ts";
export { carries, type RecordedRequest } from "./recorded-request.ts";
export {
  createSignInRig,
  type FinishedSignIn,
  type SignInRig,
  type SignInRigOptions,
  webDigest,
} from "./sign-in-rig.ts";
