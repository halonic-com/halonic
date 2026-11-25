/**
 * Public entry point of `@halonicjs/adapter-paperclip-client`: the Paperclip
 * provider behind `AgentMessaging` and `TeamStatus`, and its fixed request list.
 */
export { UnsafeAddressError } from "./address.ts";
export {
  PaperclipMessaging,
  type PaperclipMessagingOptions,
  type PaperclipUser,
} from "./client.ts";
export { paperclipSourceId } from "./ids.ts";
export {
  findRequest,
  type PaperclipRequestName,
  paperclipRequests,
  UnsafeIdError,
} from "./requests.ts";
export {
  PaperclipRunControl,
  type PaperclipRunControlOptions,
  runAgainComment,
} from "./run-control.ts";
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
  type PaperclipSignInRequestName,
  paperclipSignInRequests,
} from "./sign-in-requests.ts";
export {
  PaperclipTasks,
  type PaperclipTasksOptions,
  type TaskWriteRefusal,
  type TaskWriteResult,
} from "./tasks.ts";
export { PaperclipTeamStatus, type PaperclipTeamStatusOptions } from "./team-status.ts";
export {
  type PaperclipAnswer,
  PaperclipClientError,
  type PaperclipFailure,
  type PaperclipKeyGuard,
} from "./transport.ts";
