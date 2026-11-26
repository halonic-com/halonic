/**
 * What the phone keeps of the Inbox and Messenger between sessions (phase 2
 * G3b, architecture note on HAL-17511, section 2.4): the last lists it saw,
 * the newest messages of each conversation it opened and the person's
 * drafts, so it can show them "as of 14:02" while the computer is away.
 *
 * The page keeps only those port values, never an agent's activity, team
 * status, a key or a session. The shell stores the text it gets in the app's
 * private storage, encrypted with an Android Keystore key; the page only
 * keeps it within {@link maxSavedBytes}, dropping the oldest conversations
 * first.
 */

import type {
  Conversation,
  InboxItem,
  Message,
  MessagingId,
  MessagingSource,
} from "@halonicjs/ports";
import { gatewayMaxPromptLength } from "@halonicjs/ports";
import type { ComputerId } from "./phone-tunnel.ts";

/** The most bytes of saved text, in UTF-8, the phone keeps for one computer. */
export const maxSavedBytes = 20 * 1024 * 1024;

/** The most messages the phone keeps of one conversation: its newest. */
export const maxSavedMessages = 200;

/** Where the shell keeps one computer's saved text, encrypted. */
export interface SavedDataStore {
  /** The text saved for `computer`; `undefined` when there is none. */
  read(computer: ComputerId): Promise<string | undefined>;
  /** Replaces what is saved for `computer`. */
  write(computer: ComputerId, text: string): Promise<void>;
  /** Deletes what is saved for `computer`. */
  clear(computer: ComputerId): Promise<void>;
}

/** The newest messages of one conversation the person opened, newest first. */
export interface SavedMessages {
  readonly source: MessagingId;
  readonly conversation: MessagingId;
  readonly messages: readonly Message[];
}

/** What the person wrote in a conversation and hasn't sent. */
export interface SavedDraft {
  readonly source: MessagingId;
  readonly conversation: MessagingId;
  readonly text: string;
}

/** Everything the phone keeps for one computer. */
export interface SavedMessagingData {
  readonly version: 1;
  /** When the phone last saw any of it, as ISO text; `undefined` before the first. */
  readonly asOf: string | undefined;
  readonly sources: readonly MessagingSource[];
  readonly inbox: readonly InboxItem[];
  readonly conversations: readonly Conversation[];
  readonly opened: readonly SavedMessages[];
  readonly drafts: readonly SavedDraft[];
}

const empty: SavedMessagingData = {
  version: 1,
  asOf: undefined,
  sources: [],
  inbox: [],
  conversations: [],
  opened: [],
  drafts: [],
};

const utf8 = new TextEncoder();

/**
 * One computer's saved Inbox and Messenger. Each change is written whole,
 * one write after the other, so the last change is the one saved.
 */
export class SavedMessaging {
  private readonly store: SavedDataStore;
  private readonly computer: ComputerId;
  private readonly clock: () => Date;
  private saved: SavedMessagingData = empty;
  private writing: Promise<void> = Promise.resolve();

  constructor(store: SavedDataStore, computer: ComputerId, clock: () => Date = () => new Date()) {
    this.store = store;
    this.computer = computer;
    this.clock = clock;
  }

  /** What is saved now. */
  get data(): SavedMessagingData {
    return this.saved;
  }

  /**
   * Reads what the shell kept. Text this page can't read is deleted, since
   * nothing could show it.
   */
  async load(): Promise<SavedMessagingData> {
    const text = await this.store.read(this.computer);
    if (text === undefined) return this.saved;
    const data = parseSaved(text);
    if (data === undefined) {
      await this.store.clear(this.computer);
      return this.saved;
    }
    this.saved = data;
    return data;
  }

  /**
   * The sources the computer listed. A source that left the list, as after
   * Disconnect on the computer, takes everything saved of it along.
   */
  sawSources(sources: readonly MessagingSource[]): Promise<void> {
    const listed = new Set(sources.map((source) => source.id));
    const kept = ({ source }: { readonly source: MessagingId }) => listed.has(source);
    return this.save({
      ...this.saved,
      sources,
      inbox: this.saved.inbox.filter(kept),
      conversations: this.saved.conversations.filter(kept),
      opened: this.saved.opened.filter(kept),
      drafts: this.saved.drafts.filter(kept),
    });
  }

  /** The inbox items the phone read last. */
  sawInbox(inbox: readonly InboxItem[]): Promise<void> {
    return this.save({ ...this.saved, inbox });
  }

  /** The conversations the phone read last. */
  sawConversations(conversations: readonly Conversation[]): Promise<void> {
    return this.save({ ...this.saved, conversations });
  }

  /** The newest messages of an opened conversation, newest first; it keeps the first 200. */
  sawMessages(conversation: Conversation, messages: readonly Message[]): Promise<void> {
    const entry: SavedMessages = {
      source: conversation.source,
      conversation: conversation.id,
      messages: messages.slice(0, maxSavedMessages),
    };
    const others = this.saved.opened.filter((saved) => saved.conversation !== conversation.id);
    return this.save({ ...this.saved, opened: [...others, entry] });
  }

  /** The person's unsent text in a conversation; a blank one deletes the draft. */
  setDraft(conversation: Conversation, text: string): Promise<void> {
    const others = this.saved.drafts.filter((draft) => draft.conversation !== conversation.id);
    const draft: SavedDraft = {
      source: conversation.source,
      conversation: conversation.id,
      text: text.slice(0, gatewayMaxPromptLength),
    };
    const drafts = text.trim() === "" ? others : [...others, draft];
    return this.save({ ...this.saved, drafts }, false);
  }

  /** Deletes everything saved, as on Forget and Removed. */
  forget(): Promise<void> {
    this.saved = empty;
    return this.queue(() => this.store.clear(this.computer));
  }

  private save(data: SavedMessagingData, seen = true): Promise<void> {
    const dated = seen ? { ...data, asOf: this.clock().toISOString() } : data;
    const { kept, text } = withinCap(dated);
    this.saved = kept;
    return this.queue(() => this.store.write(this.computer, text));
  }

  /** Runs `write` after the writes before it, whatever became of them; its own failure still reaches its caller. */
  private queue(write: () => Promise<void>): Promise<void> {
    const next = this.writing.then(write, write);
    this.writing = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}

/**
 * `data` and its text, with the oldest conversations dropped until the text
 * fits {@link maxSavedBytes}. A conversation's age is when its last message
 * came: from the list, else from its newest saved message.
 */
function withinCap(data: SavedMessagingData): { kept: SavedMessagingData; text: string } {
  let kept = data;
  let text = JSON.stringify(kept);
  const oldestFirst = conversationsByAge(data);
  while (utf8.encode(text).byteLength > maxSavedBytes) {
    const oldest = oldestFirst.shift();
    if (oldest === undefined) {
      // Lists too big to keep even without any conversation: keep nothing rather than too much.
      kept = { ...empty, asOf: data.asOf };
      text = JSON.stringify(kept);
      break;
    }
    const other = ({ conversation }: { readonly conversation: MessagingId }) =>
      conversation !== oldest;
    kept = {
      ...kept,
      conversations: kept.conversations.filter((conversation) => conversation.id !== oldest),
      opened: kept.opened.filter(other),
      drafts: kept.drafts.filter(other),
    };
    text = JSON.stringify(kept);
  }
  return { kept, text };
}

function conversationsByAge(data: SavedMessagingData): MessagingId[] {
  const ages = new Map<MessagingId, string>();
  for (const { conversation, messages } of [...data.opened, ...data.drafts.map(noMessages)]) {
    ages.set(conversation, messages[0]?.sentAt ?? "");
  }
  for (const conversation of data.conversations) ages.set(conversation.id, conversation.updatedAt);
  return [...ages.entries()]
    .sort(([, left], [, right]) => left.localeCompare(right))
    .map(([conversation]) => conversation);
}

function noMessages(draft: SavedDraft): SavedMessages {
  return { source: draft.source, conversation: draft.conversation, messages: [] };
}

/** The saved data in `text`, or `undefined` when it isn't what this page writes. */
function parseSaved(text: string): SavedMessagingData | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null || !("version" in value)) return undefined;
  if (value.version !== 1) return undefined;
  const lists = ["sources", "inbox", "conversations", "opened", "drafts"] as const;
  const record = value as Record<string, unknown>;
  if (!lists.every((list) => Array.isArray(record[list]))) return undefined;
  if (record["asOf"] !== undefined && typeof record["asOf"] !== "string") return undefined;
  return value as SavedMessagingData;
}
