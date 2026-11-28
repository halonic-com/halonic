import type { ReactionEmoji } from "@halonicjs/ports";

/** Names as one phrase: "You and Chief", "You, Chief and Elena". */
const nameList = new Intl.ListFormat("en-GB", { type: "conjunction" });

/** Each emoji's name, for its button in the sheet and its chip's name for a screen reader. */
const emojiNames: Record<ReactionEmoji, string> = {
  "👍": "Thumbs up",
  "❤️": "Heart",
  "😂": "Laughing",
  "😮": "Surprised",
  "✅": "Done",
  "👀": "Eyes",
};

/**
 * The words of reactions in the phone's chats, the same as the desktop Messenger's
 * (`reaction-words.ts` in the Messenger feature, which the phone may not import): Sofia's sketch,
 * sections 4 and 6, on HAL-19139. They build on the reactions the board approved there (26 Nov),
 * so the team decides them (HAL-2282).
 */
export const phoneReactionWords = {
  you: "You",
  /** The button after a message's chips, the keyboard's and screen reader's way to the sheet. */
  add: "Add a reaction",
  name: (emoji: ReactionEmoji) => emojiNames[emoji],
  /** A chip's name for a screen reader: "Thumbs up, 2: you and Chief". */
  chip: (emoji: ReactionEmoji, names: readonly string[]) =>
    `${emojiNames[emoji]}, ${names.length}: ${nameList.format(names.map(lowerYou))}`,
  /** The sheet's caption: "React to your message", "React to Chief's message". */
  reactTo: (author: string | undefined) =>
    author === undefined ? "React to your message" : `React to ${author}'s message`,
  /** Under the six, so a long-press doesn't cost the phone its copy. */
  copyText: "Copy text",
  copyFailed: "Couldn't copy the text.",
  notSaved: "Couldn't save the reaction. Try again.",
} as const;

/** "You" mid-sentence, as a screen reader hears it after the count. */
function lowerYou(name: string): string {
  return name === phoneReactionWords.you ? "you" : name;
}
