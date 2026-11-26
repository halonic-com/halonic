import type { MessagingId } from "@halonicjs/ports";
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

/** What the box asks of the window it floats in, which the desktop app gives it. */
export interface AskWindow {
  /** Hides the box's window: Esc, or a click beside the box. */
  hide(): Promise<void>;
  /** Brings Studio's window forward, for **Open Studio** when there's no agent to ask. */
  openStudio(): Promise<void>;
  /**
   * Opens Messenger's window on the chat `conversation` and hides the box's window, for **Open in
   * Messenger**, **Answer in Messenger** and **Last answer ›**.
   */
  openChat(conversation: MessagingId): Promise<void>;
}

/**
 * The box's {@link AskWindow}, given by the desktop app. Without one, as in the served Studio,
 * the box still shows and asks; only hiding, Open Studio and opening a chat do nothing.
 */
export const AskWindowService: ServiceKey<AskWindow> = serviceKey<AskWindow>("quick-ask.window");
