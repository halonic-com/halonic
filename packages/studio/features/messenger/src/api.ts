import type { ChatClicks } from "@halonicjs/studio-services";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { Messenger } from "./messenger.ts";

export type { ConversationRow, DraftOutcome, Messenger, MessengerTab } from "./messenger.ts";

/**
 * The open workspace's {@link Messenger}. It is made the first time it's
 * asked for, from the engine's `AgentMessaging`, so a Studio without one
 * loads fine and only asking for the Messenger fails.
 */
export const MessengerService: ServiceKey<Messenger> = serviceKey<Messenger>("messenger");

/**
 * The chats the desktop shell hands Messenger's window, such as quick ask's **Open in Messenger**
 * (`messenger.handed-chats`). Only that window is given it; without it, Messenger opens no chat it
 * wasn't asked to in the page.
 */
export const ChatClicksService: ServiceKey<ChatClicks> =
  serviceKey<ChatClicks>("messenger.chat-clicks");
