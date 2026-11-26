import type { ReactionEmoji } from "@halonicjs/ports";

/** Names as one phrase: "You and Chief", "You, Chief and Elena". */
const nameList = new Intl.ListFormat("en-GB", { type: "conjunction" });

/** Each emoji's name, for its menu item, its chip's tooltip and a screen reader. */
const emojiNames: Record<ReactionEmoji, string> = {
  "👍": "Thumbs up",
  "❤️": "Heart",
  "😂": "Laughing",
  "😮": "Surprised",
  "✅": "Done",
  "👀": "Eyes",
};

/**
 * The words of reactions on messages (`messenger.reactions`), from Sofia's sketch, section 6, on
 * HAL-19139. They build on the reactions the board approved there (26 Nov), so the team decides
 * them (HAL-2282).
 */
export const reactionWords = {
  /** The add button beside a message, its name and tooltip. */
  add: "Add a reaction",
  name: (emoji: ReactionEmoji) => emojiNames[emoji],
  /** A chip's tooltip: "Thumbs up: You and Chief". */
  who: (emoji: ReactionEmoji, names: readonly string[]) =>
    `${emojiNames[emoji]}: ${nameList.format(names)}`,
  /** A chip's name for a screen reader: "Thumbs up, 2: you and Chief". */
  chip: (emoji: ReactionEmoji, names: readonly string[]) =>
    `${emojiNames[emoji]}, ${names.length}: ${nameList.format(names.map(lowerYou))}`,
  /** The row of six's name: "React to your message", "React to Chief's message". */
  reactTo: (author: string | undefined) =>
    author === undefined ? "React to your message" : `React to ${author}'s message`,
  notSaved: "Couldn't save the reaction. Try again.",
} as const;

/** "You" mid-sentence, as a screen reader hears it after the count. */
function lowerYou(name: string): string {
  return name === "You" ? "you" : name;
}
