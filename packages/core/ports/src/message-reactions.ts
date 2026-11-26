import type { MessagingAuthor, MessagingId, MessagingRefusal } from "./agent-messaging.ts";

/** Version of the {@link MessageReactions} port. A breaking change bumps it and comes with an ADR. */
export const messageReactionsVersion = 1;

/** The six emoji a person may react with, in the order apps show them (HAL-19139). */
export const reactionEmoji = ["👍", "❤️", "😂", "😮", "✅", "👀"] as const;

/** One of the six. */
export type ReactionEmoji = (typeof reactionEmoji)[number];

/** Whether `value` is one of the six emoji. */
export function isReactionEmoji(value: unknown): value is ReactionEmoji {
  return reactionEmoji.some((emoji) => emoji === value);
}

/** One reaction on one message: which emoji, who added it and when, as ISO text. */
export interface MessageReaction {
  emoji: ReactionEmoji;
  by: MessagingAuthor;
  at: string;
}

/** A conversation's reactions by message ID; a message without reactions isn't listed. */
export type ReactionsByMessage = Readonly<Record<MessagingId, readonly MessageReaction[]>>;

/**
 * What reading a conversation's reactions gave. `not-supported` means the
 * source keeps no reactions (a source, or a host, too old for them): apps show
 * the conversation without them and never fail it.
 */
export type ReactionsRead =
  | { outcome: "read"; reactions: ReactionsByMessage }
  | { outcome: "refused"; reason: MessagingRefusal };

/** What adding or removing the person's own reaction did: the message's reactions after it. */
export type ReactResult =
  | { outcome: "saved"; reactions: readonly MessageReaction[] }
  | { outcome: "refused"; reason: MessagingRefusal };

/**
 * Reactions on the messages of a conversation (HAL-19139, the board's yes on
 * 26 Nov). A reaction is never a message: it wakes no agent and never counts
 * as unread. Apps read a conversation's reactions and add or remove only the
 * person's own; agents add theirs on the source's side. A separate port, so
 * `AgentMessaging` and its implementations stay as they are: where nothing
 * provides it, apps show no reactions.
 */
export interface MessageReactions {
  /** The reactions on `conversation`'s messages. */
  list(conversation: MessagingId): Promise<ReactionsRead>;
  /** Adds (`on: true`) or removes the person's own `emoji` on `message`. */
  react(message: MessagingId, emoji: ReactionEmoji, on: boolean): Promise<ReactResult>;
}
