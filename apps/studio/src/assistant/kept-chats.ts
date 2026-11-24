import type { ChatMessage } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import type { ChatKind, ChatModel } from "@halonicjs/studio-feature-assistant/api";

/** One chat as the window keeps it. */
export interface KeptChat {
  readonly id: string;
  readonly kind: ChatKind;
  readonly title: string;
  readonly lastUsedAt: string;
  readonly model: ChatModel;
  readonly messages: readonly ChatMessage[];
  readonly draft: boolean;
}

const newChatTitle = "New chat";
const kept = 40;

/**
 * The chats of one open workspace, in memory while the window is open (flow-assistant 5.4): a
 * draft until its first message, its title from that message, the 40 most recently used. The
 * sessions port of T14 PR 2 and its store on disk (PR 3) take its place; until then a chat goes
 * when the window closes.
 */
export class KeptChats {
  readonly #chats = new Map<string, KeptChat>();
  readonly #now: () => Date;
  readonly #onGone: (chatId: string) => void;
  #made = 0;

  /** `onGone` hears of every chat that goes, deleted or past the 40, so its holder can let go of it. */
  constructor(now: () => Date, onGone: (chatId: string) => void = () => {}) {
    this.#now = now;
    this.#onGone = onGone;
  }

  /** The kept chats, most recently used first, drafts left out. */
  list(): readonly KeptChat[] {
    return [...this.#chats.values()]
      .filter((chat) => !chat.draft)
      .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
  }

  /** One chat, draft or kept; rejects with `not_found` when it isn't there. */
  get(chatId: string): KeptChat {
    const chat = this.#chats.get(chatId);
    if (chat === undefined) throw new KindedError("not_found", "This chat isn't there any more.");
    return chat;
  }

  /** A new draft of `kind` on `model`, or the empty draft of that kind there is already. */
  newChat(kind: ChatKind, model: ChatModel): KeptChat {
    const empty = [...this.#chats.values()].find((chat) => chat.draft && chat.kind === kind);
    if (empty !== undefined) return empty;
    this.#made += 1;
    const chat: KeptChat = {
      id: `chat-${this.#now().getTime()}-${this.#made}`,
      kind,
      title: newChatTitle,
      lastUsedAt: this.#now().toISOString(),
      model,
      messages: [],
      draft: true,
    };
    this.#chats.set(chat.id, chat);
    return chat;
  }

  /** Adds a message sent or received: the chat is kept from now on, and the oldest past 40 goes. */
  add(chatId: string, message: ChatMessage): void {
    const chat = this.get(chatId);
    const first = chat.draft && message.role === "user";
    this.#chats.set(chatId, {
      ...chat,
      title: first ? titleOf(message.content) : chat.title,
      lastUsedAt: this.#now().toISOString(),
      messages: [...chat.messages, message],
      draft: chat.draft && !first,
    });
    for (const old of this.list().slice(kept)) this.#remove(old.id);
  }

  /** Changes what the person may change: the title or the model. */
  change(chatId: string, change: Partial<Pick<KeptChat, "title" | "model">>): void {
    this.#chats.set(chatId, { ...this.get(chatId), ...change });
  }

  /** Removes the chat; rejects with `not_found` when it isn't there. */
  delete(chatId: string): void {
    this.get(chatId);
    this.#remove(chatId);
  }

  #remove(chatId: string): void {
    this.#chats.delete(chatId);
    this.#onGone(chatId);
  }
}

/**
 * A chat's title from its first message: the first line, spaces collapsed, cut at 57 characters
 * and "…" when longer than 60 (`assistant.sessions.title-from-first-message`).
 */
function titleOf(message: string): string {
  const line = (message.trim().split("\n")[0] ?? "").replace(/\s+/g, " ").trim();
  if (line === "") return newChatTitle;
  return line.length > 60 ? `${line.slice(0, 57)}…` : line;
}
