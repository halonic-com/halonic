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
export {
  type FeedbackSendOutcome,
  type FeedbackTaskInput,
  feedbackKey,
  feedbackRefusals,
  PaperclipFeedback,
  type PaperclipFeedbackOptions,
} from "./feedback.ts";
export { paperclipSourceId } from "./ids.ts";
export {
  type LiveClosedWhy,
  LiveEventsConnection,
  type LiveEventsOptions,
  type LiveSignal,
  liveFrameMaxBytes,
} from "./live-events.ts";
export type { LiveEvent } from "./live-messages.ts";
export { type SyncCollectionName, touchedBy } from "./live-touches.ts";
export { PaperclipReactions, type ReactionsContext } from "./reactions.ts";
export {
  findRequest,
  type PaperclipRequestName,
  paperclipRequests,
  UnsafeIdError,
} from "./requests.ts";
export {
  logRouteTimings,
  type RouteTiming,
  type RouteTimingSink,
  routeTimingLine,
} from "./route-timing.ts";
export {
  PaperclipRunControl,
  type PaperclipRunControlOptions,
  runAgainComment,
} from "./run-control.ts";
export {
  type ShadowCallCounts,
  type ShadowRequestName,
  shadowRequestNames,
} from "./shadow-fetch.ts";
export {
  PaperclipShadowReader,
  type PaperclipShadowReaderOptions,
  type ShadowApprovalRead,
  shadowAnswerMaxBytes,
} from "./shadow-reads.ts";
export {
  approvalPageUrl,
  PaperclipSignInClient,
  type PaperclipSignInClientOptions,
  type SignInChallenge,
  type SignInChallengeRef,
  type SignInChallengeRequest,
  type SignInChallengeStatus,
  type SignInKeyOwner,
  signInClientName,
} from "./sign-in.ts";
export { newSignInPhrase, phraseWordCount, signInPhraseWords } from "./sign-in-phrase.ts";
export {
  type PaperclipSignInRequestName,
  paperclipSignInRequests,
} from "./sign-in-requests.ts";
export {
  PaperclipTaskTools,
  type PaperclipTaskToolsOptions,
  prWatcherPassTool,
} from "./task-tools.ts";
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
