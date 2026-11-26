import { type MessageReaction, type ReactionEmoji, reactionEmoji } from "@halonicjs/ports";
import { messengerWords } from "./messenger-words.ts";

/** One chip under a message (`messenger.reactions`): an emoji, who reacted with it, and whether the person did. */
export interface ReactionChip {
  readonly emoji: ReactionEmoji;
  readonly count: number;
  /** The person's own is among them: the chip shows pressed. */
  readonly mine: boolean;
  /** Who reacted, the person first as "You": the chip's tooltip and its name for a screen reader. */
  readonly names: readonly string[];
}

/**
 * A message's chips, in the set's own order (👍 ❤️ 😂 😮 ✅ 👀), never by count, so they don't move
 * about; an emoji nobody used has no chip. One author counts once per emoji.
 */
export function chipsOf(reactions: readonly MessageReaction[]): readonly ReactionChip[] {
  return reactionEmoji.flatMap((emoji) => {
    const names = new Set<string>();
    let mine = false;
    for (const reaction of reactions) {
      if (reaction.emoji !== emoji) continue;
      if (reaction.by.kind === "me") mine = true;
      else names.add(reaction.by.name);
    }
    const all = mine ? [messengerWords.you, ...names] : [...names];
    return all.length === 0 ? [] : [{ emoji, count: all.length, mine, names: all }];
  });
}

/** Whether the person's own `emoji` is on a message. */
export function isMine(reactions: readonly MessageReaction[], emoji: ReactionEmoji): boolean {
  return reactions.some((reaction) => reaction.emoji === emoji && reaction.by.kind === "me");
}

/**
 * A message's reactions with the person's own `emoji` added (`on`) or taken off, as the chips show
 * it at once, before the source has it.
 */
export function toggled(
  reactions: readonly MessageReaction[],
  emoji: ReactionEmoji,
  on: boolean,
  at: string,
): readonly MessageReaction[] {
  const others = reactions.filter(
    (reaction) => !(reaction.emoji === emoji && reaction.by.kind === "me"),
  );
  return on ? [...others, { emoji, by: { kind: "me" }, at }] : others;
}
