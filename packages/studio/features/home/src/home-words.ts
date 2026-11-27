/**
 * Home's words (HAL-20673 rail flows, section 2). "No chats yet." waits on the board's wording
 * pick (that document's "Open for the board", item 7); a different pick changes only this file.
 */
export const homeWords = {
  /** The page's heading and its list column's name for screen readers. */
  title: "Home",
  /** The list column's first row, and the button's name. */
  newChat: "New chat",
  /** Names the list of AI chats for screen readers. */
  chats: "Chats",
  /** Under "New chat" while the folder has no AI chats. */
  noChats: "No chats yet.",
  /** Said when a new chat can't start, with the reason after it. */
  newChatFailed: "Couldn't start a chat.",
} as const;
