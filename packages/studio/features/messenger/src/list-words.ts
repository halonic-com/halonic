/**
 * The words of the Messenger's list entry "Needs you", its panel, the chat search (Ctrl+K) and the
 * find bar in a chat (Ctrl+F), from Sofia's sketches on HAL-19134, approved on HAL-19132.
 */
export const listWords = {
  needsYou: {
    title: "Needs you",
    /** The entry's violet count, for a screen reader: "3 waiting". */
    waiting: (count: number) => ` ${count} waiting`,
    /** Under the panel's title. */
    count: (count: number) => `${count} waiting, oldest first`,
    none: "Nothing is waiting for you.",
    /** After who asked: "in #release-0-2", or the chat's name. */
    where: (name: string) => `in ${name}`,
    openChat: "Open chat",
  },
  search: {
    button: "Search chats (Ctrl+K)",
    label: "Search chats",
    /** Over the chats a search found. */
    count: (count: number) => (count === 1 ? "1 chat" : `${count} chats`),
    noMatches: "No chat matches.",
    close: "Esc",
  },
  find: {
    button: "Find in this chat (Ctrl+F)",
    label: "Find in this chat",
    /** Which match is shown, of how many: "2 of 5". */
    position: (at: number, of: number) => `${at} of ${of}`,
    previous: "Previous match",
    next: "Next match",
    close: "Close find",
  },
} as const;
