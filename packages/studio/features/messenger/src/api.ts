import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { Messenger } from "./messenger.ts";

export type { ConversationRow, DraftOutcome, Messenger, MessengerTab } from "./messenger.ts";

/**
 * The open workspace's {@link Messenger}. It is made the first time it's
 * asked for, from the engine's `AgentMessaging`, so a Studio without one
 * loads fine and only asking for the Messenger fails.
 */
export const MessengerService: ServiceKey<Messenger> = serviceKey<Messenger>("messenger");
