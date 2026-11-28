/**
 * The chat Home's content pane holds (`assistant.home.chats`): a third place, apart from the side
 * panel and the tabs. The Assistant alone decides where a chat is, and a chat is in one place at a
 * time, so when the held chat goes anywhere else it leaves Home, and Home hears it.
 */
export class HomeHold {
  private chatId: string | undefined;
  private readonly listeners = new Set<{ readonly chatId: string; readonly onLeave: () => void }>();

  /** The chat Home holds now, if any. */
  held(): string | undefined {
    return this.chatId;
  }

  /**
   * Holds `chatId` in Home. The function it returns lets go of it, after which it is an ordinary
   * panel chat again; it does nothing once Home holds another chat.
   */
  hold(chatId: string): () => void {
    this.chatId = chatId;
    return () => {
      if (this.chatId === chatId) this.chatId = undefined;
    };
  }

  /** Calls `onLeave` when `chatId` leaves Home for another place. Returns the function that stops it. */
  whenLeaves(chatId: string, onLeave: () => void): () => void {
    const entry = { chatId, onLeave };
    this.listeners.add(entry);
    return () => this.listeners.delete(entry);
  }

  /** `chatId` went to the panel or a tab, or was deleted: if Home held it, Home lets go. */
  leave(chatId: string): void {
    if (this.chatId !== chatId) return;
    this.chatId = undefined;
    for (const entry of [...this.listeners]) {
      if (entry.chatId === chatId) entry.onLeave();
    }
  }
}
