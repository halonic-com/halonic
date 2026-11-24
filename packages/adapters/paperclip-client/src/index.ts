/**
 * Public entry point of `@halonicjs/adapter-paperclip-client`: the Paperclip
 * provider behind `AgentMessaging` and `TeamStatus`, and its fixed request list.
 */
export { UnsafeAddressError } from "./address.ts";
export { PaperclipMessaging, type PaperclipMessagingOptions } from "./client.ts";
export {
  findRequest,
  type PaperclipRequestName,
  paperclipRequests,
  UnsafeIdError,
} from "./requests.ts";
export {
  PaperclipSignInClient,
  type PaperclipSignInClientOptions,
  type SignInChallenge,
  type SignInChallengeRef,
  type SignInChallengeRequest,
  type SignInChallengeStatus,
  type SignInKeyOwner,
} from "./sign-in.ts";
export {
  findSignInRequest,
  type PaperclipSignInRequestName,
  paperclipSignInRequests,
} from "./sign-in-requests.ts";
export { PaperclipTeamStatus, type PaperclipTeamStatusOptions } from "./team-status.ts";
export { PaperclipClientError, type PaperclipFailure } from "./transport.ts";
