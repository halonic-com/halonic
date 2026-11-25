import {
  chatsToDrop,
  chatToSave,
  draftTitle,
  isDraft,
  recentFirst,
  restoredChat,
  titleAfterSend,
} from "@halonicjs/assistant";
import type { ChatMessage, ChatSessions, SavedChatDocs, SavedChatSummary } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import {
  type ChatAbout,
  type ChatKind,
  type ChatModel,
  sameAbout,
} from "@halonicjs/studio-feature-assistant/api";

/** One chat as the window keeps it. */
export interface KeptChat {
  readonly id: string;
  readonly kind: ChatKind;
  readonly title: string;
  readonly lastUsedAt: string;
  readonly model: ChatModel;
  readonly messages: readonly ChatMessage[];
  readonly draft: boolean;
  /** The item a Build chat is about; absent for a chat about no item. */
  readonly about?: ChatAbout | undefined;
  /** True when it was answering as Halonic closed, until its next message (H14). */
  readonly stoppedWhenClosed: boolean;
  /** A Build chat's docs sites and log (`studio.assistant-read-docs`); absent until it reads docs. */
  readonly docs?: SavedChatDocs | undefined;
}

/** Where the chats of one workspace are saved. */
export interface ChatStore {
  readonly sessions: ChatSessions;
  /** The workspace's resolved real path, which names it in the store. */
  readonly location: string;
}

/** What {@link KeptChats} works with. */
export interface KeptChatsParts {
  readonly store: ChatStore;
  readonly now: () => Date;
  /** Hears of every chat that goes, deleted or past the 40, so its holder can let go of it. */
  readonly onGone?: ((chatId: string) => void) | undefined;
  /** Hears of a chat the store couldn't save or delete; the chat stays in the window. */
  readonly onSaveFailed?: ((error: unknown) => void) | undefined;
}

/**
 * The chats of one open workspace (flow-assistant 5.4), kept in the window and saved in the
 * {@link ChatSessions} store, so they come back when the workspace opens again. The rules are
 * `@halonicjs/assistant`'s: a draft until its first message and never saved, its title from that
 * message, the 40 most recently used, and a chat that was answering comes back stopped.
 *
 * The store is shared with the agents' Try it chats, which save to it on their own. So the chats
 * are read from the store again on every {@link KeptChats.list} and {@link KeptChats.get}, taking
 * any saved copy newer than the window's, and the 40 are counted on the store's list. Every change
 * is saved in the order it happened; {@link KeptChats.saved} waits for the saves started so far.
 */
export class KeptChats {
  readonly #parts: KeptChatsParts;
  readonly #chats = new Map<string, KeptChat>();
  readonly #answering = new Set<string>();
  #saving: Promise<void> = Promise.resolve();
  #made = 0;

  constructor(parts: KeptChatsParts) {
    this.#parts = parts;
  }

  /** The kept chats, most recently used first, drafts left out. */
  async list(): Promise<readonly KeptChat[]> {
    await this.#readSaved();
    return this.#listed();
  }

  /** One chat, draft or kept; rejects with `not_found` when it isn't there. */
  async get(chatId: string): Promise<KeptChat> {
    await this.#readSaved();
    return this.#got(chatId);
  }

  /**
   * A new draft of `kind` on `model` about `about`, or the empty draft of that kind about the same
   * item there is already.
   */
  async newChat(kind: ChatKind, model: ChatModel, about?: ChatAbout): Promise<KeptChat> {
    await this.#readSaved();
    const empty = [...this.#chats.values()].find(
      (chat) => chat.draft && chat.kind === kind && sameAbout(chat.about, about),
    );
    if (empty !== undefined) return empty;
    this.#made += 1;
    const chat: KeptChat = {
      id: `chat-${this.#parts.now().getTime()}-${this.#made}`,
      kind,
      title: draftTitle,
      lastUsedAt: this.#parts.now().toISOString(),
      model,
      messages: [],
      draft: true,
      stoppedWhenClosed: false,
      ...(about === undefined ? {} : { about }),
    };
    this.#chats.set(chat.id, chat);
    return chat;
  }

  /**
   * Adds a message sent or received to a chat already read with {@link KeptChats.get}: the chat is
   * saved from its first message from the person on, and the oldest past 40 is deleted.
   */
  add(chatId: string, message: ChatMessage): void {
    const chat = this.#got(chatId);
    const messages = [...chat.messages, message];
    this.#set({
      ...chat,
      title:
        message.role === "user" && chat.draft
          ? titleAfterSend(chat.title, message.content)
          : chat.title,
      lastUsedAt: this.#parts.now().toISOString(),
      messages,
      draft: isDraft(messages),
      stoppedWhenClosed: false,
    });
    for (const old of chatsToDrop(this.#listed().map(summaryOf))) this.#remove(old);
    this.#store((sessions, location) => this.#dropPast40(sessions, location));
  }

  /** Changes what the person may change: the title or the model. */
  async change(chatId: string, change: Partial<Pick<KeptChat, "title" | "model">>): Promise<void> {
    this.#set({ ...(await this.get(chatId)), ...change });
  }

  /**
   * Changes a chat's docs sites or log, read with {@link KeptChats.get} before, and saves it. It
   * isn't a message, so the chat's place in the recent chats stays.
   */
  changeDocs(chatId: string, change: (docs: SavedChatDocs) => SavedChatDocs): void {
    const chat = this.#got(chatId);
    this.#set({ ...chat, docs: change(chat.docs ?? { sites: [], log: [] }) });
  }

  /** Marks whether the chat is answering, saved so a chat cut off by closing comes back stopped. */
  answering(chatId: string, answering: boolean): void {
    if (answering) this.#answering.add(chatId);
    else this.#answering.delete(chatId);
    const chat = this.#chats.get(chatId);
    if (chat !== undefined) this.#set(chat);
  }

  /** Removes the chat; rejects with `not_found` when it isn't there. */
  async delete(chatId: string): Promise<void> {
    await this.get(chatId);
    this.#remove(chatId);
  }

  /** Waits for every save and delete started so far. */
  saved(): Promise<void> {
    return this.#saving;
  }

  /** Takes in every saved chat the window doesn't have, or has an older copy of. */
  async #readSaved(): Promise<void> {
    // The window's own saves and deletes land first, so a chat it just let go doesn't come back.
    await this.#saving;
    const { sessions, location } = this.#parts.store;
    for (const summary of await sessions.list(location)) {
      if (!this.#savedIsNewer(summary)) continue;
      const saved = await sessions.load(location, summary.id);
      if (saved === null) continue;
      const { chat, stoppedWhenClosed } = restoredChat(saved);
      const { id, kind, title, lastUsedAt, model, messages, about, docs } = chat;
      // A chat changed in this window while the store answered wins over its saved copy.
      if (!this.#savedIsNewer(summary)) continue;
      this.#chats.set(id, {
        id,
        kind,
        title,
        lastUsedAt,
        model,
        messages,
        draft: false,
        stoppedWhenClosed,
        ...(about === undefined ? {} : { about }),
        ...(docs === undefined ? {} : { docs }),
      });
    }
  }

  /**
   * Whether the saved copy was used after the window's, as when a Try it chat had turns added
   * outside this window's sight. A chat answering here is the window's own.
   */
  #savedIsNewer(summary: SavedChatSummary): boolean {
    const kept = this.#chats.get(summary.id);
    if (kept === undefined) return true;
    if (this.#answering.has(summary.id)) return false;
    return Date.parse(summary.lastUsedAt) > Date.parse(kept.lastUsedAt);
  }

  /** Deletes the chats past the 40 on the store's list, which holds the Try it chats too. */
  async #dropPast40(sessions: ChatSessions, location: string): Promise<void> {
    for (const old of chatsToDrop(await sessions.list(location))) {
      await sessions.delete(location, old);
      this.#forget(old);
    }
  }

  #listed(): readonly KeptChat[] {
    return [...this.#chats.values()]
      .filter((chat) => !chat.draft)
      .sort((left, right) => recentFirst(summaryOf(left), summaryOf(right)));
  }

  #got(chatId: string): KeptChat {
    const chat = this.#chats.get(chatId);
    if (chat === undefined) throw new KindedError("not_found", "This chat isn't there any more.");
    return chat;
  }

  /** Keeps the chat and saves it, unless it is a draft. */
  #set(chat: KeptChat): void {
    this.#chats.set(chat.id, chat);
    const toSave = chatToSave({
      ...summaryOf(chat),
      answering: this.#answering.has(chat.id),
      model: chat.model,
      messages: [...chat.messages],
      ...(chat.docs === undefined ? {} : { docs: chat.docs }),
    });
    if (toSave !== null) this.#store((sessions, location) => sessions.save(location, toSave));
  }

  #remove(chatId: string): void {
    this.#store((sessions, location) => sessions.delete(location, chatId));
    this.#forget(chatId);
  }

  #forget(chatId: string): void {
    this.#chats.delete(chatId);
    this.#answering.delete(chatId);
    this.#parts.onGone?.(chatId);
  }

  #store(change: (sessions: ChatSessions, location: string) => Promise<void>): void {
    const { sessions, location } = this.#parts.store;
    this.#saving = this.#saving
      .then(() => change(sessions, location))
      .catch((error: unknown) => this.#parts.onSaveFailed?.(error));
  }
}

function summaryOf(chat: KeptChat): SavedChatSummary {
  const { id, kind, title, lastUsedAt, about } = chat;
  return {
    id,
    kind,
    title,
    lastUsedAt,
    answering: false,
    ...(about === undefined ? {} : { about }),
  };
}
