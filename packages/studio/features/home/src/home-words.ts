/**
 * Home's words (HAL-20673 rail flows, section 2). "No chats yet." waits on the board's wording
 * pick (that document's "Open for the board", item 7), as do the other new phrases here; a
 * different pick changes only this file.
 */
export const homeWords = {
  /** Names the list column for screen readers; the page's heading is the shell's own. */
  title: "Home",
  /** The list column's first row, and the button's name. */
  newChat: "New chat",
  /** Names the list of AI chats for screen readers. */
  chats: "Chats",
  /** Under "New chat" while the folder has no AI chats. */
  noChats: "No chats yet.",
  /** Said when a new chat can't start, with the reason after it. */
  newChatFailed: "Couldn't start a chat.",
  /** Said when the list of chats can't be read, with the reason after it. */
  chatsFailed: "Couldn't load the chats.",
  /** After a failed read's reason: reads the chats again. The Library's word for its retry line. */
  tryAgain: "Try again",
} as const;
