import type { AnswerResult, InboxAnswer, MessagingSource } from "@halonicjs/ports";
import type { ActionSteps } from "@halonicjs/studio-services";
import type { ActionItem, ActionReviewContext } from "../review/action-item-review.ts";
import type { ConnectionsRead } from "../review/paperclip-host.ts";
import type { StepperSignIn } from "./sign-in-run.ts";

/** What a `StepperRun` checks against, runs with and answers through. */
export interface StepperRunOptions {
  readonly item: ActionItem;
  /** The item's source as `AgentMessaging` lists it, which the requester policy keys on. */
  readonly source: MessagingSource | undefined;
  readonly catalog: ActionReviewContext["catalog"];
  readonly policy: ActionReviewContext["policy"];
  readonly steps: ActionSteps;
  /** Answers the item through `AgentMessaging`, once. */
  readonly answer: (answer: InboxAnswer) => Promise<AnswerResult>;
  /** The clock for expiry and for the day a secret was set. */
  readonly now: () => Date;
  /** Runs a definition's `sign-in` steps; without it, such a request can't run here. */
  readonly serviceSignIn?: StepperSignIn | undefined;
  /**
   * The connections as this window last read them, read again at every check, so a Paperclip
   * disconnected since stops its requests. Without it, no Paperclip request runs; while they are
   * still being read, a Paperclip request waits in review mode until `StepperRun.recheck`.
   */
  readonly paperclips?: (() => ConnectionsRead) | undefined;
}
