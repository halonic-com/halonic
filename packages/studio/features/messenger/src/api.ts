import type { ChatOpens } from "@halonicjs/studio-services";
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
 * The chats quick ask's box hands to Messenger's window; the app provides it in the desktop shell
 * (`shellChatOpens`). Without it, as in a browser, the Messenger opens no chat by itself.
 */
export const ChatOpensService: ServiceKey<ChatOpens> =
  serviceKey<ChatOpens>("messenger.chat-opens");
