import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { AskSession } from "./ask-session.ts";

export type { AnswerState } from "./ask-answer.ts";
export type { AskAgent, AskOpening, AskOutcome, AskSession, LastAnswer } from "./ask-session.ts";

/**
 * The quick-ask box's {@link AskSession}, made the first time it's asked for from the open
 * workspace's Messenger, so a Studio without one loads fine and only asking fails.
 */
export const AskSessionService: ServiceKey<AskSession> =
  serviceKey<AskSession>("quick-ask.session");
