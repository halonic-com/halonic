import {
  type ChatSessions,
  isSavedChat,
  type SavedChat,
  type SavedChatSummary,
  savedChatIdPattern,
} from "@halonicjs/ports";

/**
 * Chats in memory, for tests and the browser demo (requirement `memory.chat-sessions`). Each
 * chat is kept as JSON text, the way a file in the user's profile would hold it, so every read
 * gives a fresh copy and a damaged chat can be modelled.
 */
export class MemoryChatSessions implements ChatSessions {
  readonly #texts = new Map<string, Map<string, string>>();

  async list(location: string): Promise<SavedChatSummary[]> {
    const chats: SavedChat[] = [];
    for (const text of this.#texts.get(location)?.values() ?? []) {
      const chat = parseChat(text);
      if (chat !== null) chats.push(chat);
    }
    return chats
      .sort(
        (left, right) =>
          Date.parse(right.lastUsedAt) - Date.parse(left.lastUsedAt) ||
          (left.id < right.id ? -1 : 1),
      )
      .map(({ messages: _messages, model: _model, ...summary }) => summary);
  }

  async load(location: string, id: string): Promise<SavedChat | null> {
    const text = this.#texts.get(location)?.get(id);
    return text === undefined ? null : parseChat(text);
  }

  async save(location: string, chat: SavedChat): Promise<void> {
    if (!savedChatIdPattern.test(chat.id)) {
      throw new RangeError(`A saved chat's id can't be ${JSON.stringify(chat.id)}.`);
    }
    let chats = this.#texts.get(location);
    if (chats === undefined) {
      chats = new Map();
      this.#texts.set(location, chats);
    }
    chats.set(chat.id, JSON.stringify(chat));
  }

  async delete(location: string, id: string): Promise<void> {
    this.#texts.get(location)?.delete(id);
  }

  /**
   * For tests: makes the chat `id` of `location` unreadable, as a damaged file would be. It is
   * then left out of `list`, `load` gives `null`, and `save` and `delete` still work.
   *
   * @throws when there is no such chat, so a test can't damage a chat it never saved
   */
  damage(location: string, id: string): void {
    const chats = this.#texts.get(location);
    if (chats?.has(id) !== true) {
      throw new Error(
        `There is no chat ${JSON.stringify(id)} in ${JSON.stringify(location)} to damage.`,
      );
    }
    chats.set(id, "{");
  }
}

function parseChat(text: string): SavedChat | null {
  try {
    const chat: unknown = JSON.parse(text);
    return isSavedChat(chat) ? chat : null;
  } catch {
    return null;
  }
}
