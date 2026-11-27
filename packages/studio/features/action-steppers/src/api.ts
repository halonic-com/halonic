/**
 * The services and types other features may use. Features import each other only through this
 * file. The Inbox opens action items with these: it reviews the item and draws the screen.
 */
import {
  defaultRequesterPolicy,
  type RequesterPolicy,
  type StepperCatalog,
} from "@halonicjs/action-steppers";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

export {
  type ActionItem,
  type ActionItemReview,
  type ActionReviewContext,
  reviewActionItem,
} from "./review/action-item-review.ts";
export type { ConnectedPaperclip, ConnectionsRead } from "./review/paperclip-host.ts";
export { type ActionItemRead, actionItemOf, stepperItemReasons } from "./review/stepper-item.ts";
export { StepperRun } from "./run/stepper-run.ts";
export type { StepperRunOptions } from "./run/stepper-run-options.ts";
export {
  offerServerSession,
  type ServerSessionContext,
  type ServerSessionOffer,
} from "./server-session/server-session-offer.ts";
export {
  type ServerChoice,
  type ServerSessionAnswer,
  type ServerSessionRequest,
  type ServerSessionShell,
  type ServerSettings,
  serverChoice,
} from "./server-session/server-session-shell.ts";
export type { StepperActions, StepperView } from "./stepper-view.ts";
export { ActionStepper, type ActionStepperProps } from "./ui/action-stepper.tsx";
export { RunWithClaude, type RunWithClaudeProps } from "./ui/run-with-claude.tsx";
export { useConnectedPaperclips } from "./ui/use-connected-paperclips.ts";
export { type StepperRunState, useStepperRun } from "./ui/use-stepper-run.ts";

/**
 * The installed catalog of reviewed definitions, step types and browser pages. The app provides it
 * once `core/action-catalog` ships (HAL-17518); without it every request is unreadable, since
 * nothing is in the catalog.
 */
export const ActionCatalogService: ServiceKey<StepperCatalog> =
  serviceKey<StepperCatalog>("action-steppers.catalog");

/**
 * The user's requester policy, from their profile (HAL-17491 6.5). The app provides it once
 * Settings can change it; without it the default holds: anyone may ask for routine steppers and
 * nobody for more.
 */
export const RequesterPolicyService: ServiceKey<RequesterPolicy> = serviceKey<RequesterPolicy>(
  "action-steppers.requester-policy",
);

/** The catalog while the app provides none: it holds nothing, so no request can be read. */
export const emptyActionCatalog: StepperCatalog = {
  definition: () => undefined,
  stepType: () => undefined,
  browserOrigins: [],
  route: () => undefined,
};

export { defaultRequesterPolicy, type RequesterPolicy, type StepperCatalog };
