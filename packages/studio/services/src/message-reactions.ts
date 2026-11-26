import type { MessageReactions } from "@halonicjs/ports";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

/**
 * How the Messenger reads and toggles reactions on a conversation's messages
 * (HAL-19139). Features reach it only through this key, never through a
 * provider. Where no agent host serves it, nothing provides it and the
 * Messenger shows no reactions.
 */
export const MessageReactionsService: ServiceKey<MessageReactions> =
  serviceKey<MessageReactions>("message-reactions");
