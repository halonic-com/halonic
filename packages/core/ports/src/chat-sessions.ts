import type { ChatMessage } from "./chat.ts";

/** Version of the {@link ChatSessions} port. A breaking change bumps it and comes with an ADR. */
export const chatSessionsVersion = 1;

/**
 * Who a saved chat talks to: `build`, the Build assistant, or `agent:<hub>/<id>`, one agent as
 * its Try it chat does. A chat's kind never changes.
 */
export type SavedChatKind = "build" | `agent:${string}`;

/**
 * The model a saved chat uses: the Assistant model, or one of the workspace's model aliases,
 * kept by name even after the alias is removed. An agent chat uses its agent's model.
 */
export type SavedChatModel = { kind: "assistant" } | { kind: "alias"; name: string };

/** The kinds of item a Build chat can be about: a workflow, an agent or a library item. */
export const savedChatAboutKinds = [
  "workflow",
  "agent",
  "skill",
  "knowledge",
  "collection",
  "connector",
] as const;

/**
 * The item a Build chat is about, such as the workflow whose page it sits on. Only the reference
 * is kept, never the item's name, so a renamed item keeps its chats.
 */
export interface SavedChatAbout {
  kind: (typeof savedChatAboutKinds)[number];
  /** The hub the item is in. */
  hub: string;
  /** The item's id in its hub. */
  id: string;
}

/** One row of the recent chats, without its messages. */
export interface SavedChatSummary {
  /** Matches {@link savedChatIdPattern}, so an adapter may use it as a file name. */
  id: string;
  kind: SavedChatKind;
  title: string;
  /** When a message was last sent or received, as ISO text. Opening a chat doesn't count. */
  lastUsedAt: string;
  /** True when the chat was answering as it was saved. */
  answering: boolean;
  /**
   * The item a `build` chat is about, so a page can list only its own chats. Missing for a chat
   * about no item, and for an `agent:` chat, which says what it's about through its kind.
   */
  about?: SavedChatAbout;
}

/**
 * A chat as Halonic keeps it between launches (requirement `ports.chat-sessions`).
 *
 * @example
 * const chat: SavedChat = {
 *   id: "c-1",
 *   kind: "build",
 *   title: "Add a routine",
 *   lastUsedAt: "2026-11-23T10:42:00.000Z",
 *   answering: false,
 *   model: { kind: "assistant" },
 *   about: { kind: "workflow", hub: "support", id: "triage" },
 *   messages: [{ role: "user", content: "Add a routine" }],
 * };
 */
export interface SavedChat extends SavedChatSummary {
  model: SavedChatModel;
  /** The conversation, oldest first, as the model sees it. */
  messages: ChatMessage[];
  /**
   * A Build chat's docs sites and docs log, for its `read_docs` tool. Missing for a chat that
   * read no docs. Kept with the chat, never in the workspace, so no workspace file can allow a site.
   */
  docs?: SavedChatDocs;
}

/** What the person said about one docs site in a chat: `asked` while its card waits. */
export type SavedSiteAnswer = "asked" | "allowed" | "declined";

/** One site a Build chat asked to read docs from, and the person's answer. */
export interface SavedDocsSite {
  /** The site's host, exactly as its card showed it, such as `docs.example.com`. */
  host: string;
  answer: SavedSiteAnswer;
  /** The `read_docs` call whose card asked, so the card sits under it. */
  cardId: string;
}

/** How one `read_docs` call ended, as `@halonicjs/assistant` names it. */
export type SavedDocsOutcome =
  | "read"
  | "moved"
  | "not-read"
  | "waiting"
  | "declined"
  | "refused"
  | "untrusted";

/** One line of a Build chat's docs log: never a request header or the page's text. */
export interface SavedDocsLogEntry {
  /** The `read_docs` call it is for, so it shows under that call. */
  callId: string;
  /** When the call was made, as ISO text. */
  at: string;
  /** The address, without a query or fragment. */
  url: string;
  outcome: SavedDocsOutcome;
  /** The site's status, when it answered. */
  status?: number | undefined;
  /** How many bytes of the page were read. */
  bytes: number;
  /** Where a `3xx` pointed, which wasn't followed. */
  location?: string | undefined;
}

/** A Build chat's docs sites, in the order they were asked, and its docs log, oldest first. */
export interface SavedChatDocs {
  sites: SavedDocsSite[];
  log: SavedDocsLogEntry[];
}

/** A saved chat's id: 1 to 64 lowercase letters, digits and `-`, starting with a letter or digit. */
export const savedChatIdPattern = /^[a-z0-9][a-z0-9-]{0,63}$/u;

/**
 * The chats of each workspace, in the user's profile on this computer: the profile folder for
 * the CLI and `serve`, the app data folder for the desktop app, memory for tests and the browser
 * demo. Build and agent chats are kept in one list per workspace.
 *
 * The port only stores. The rules (a draft is never saved, the title, the newest 40, recent
 * first, long tool results cut, a chat that was answering comes back stopped) are in
 * `core/assistant`, which decides what to save and what to delete.
 *
 * A chat that can't be read (a damaged file, or one a newer Halonic wrote) is left out of `list`,
 * `load` gives `null` for it, and `delete` still removes it: a lost chat costs only its history.
 */
export interface ChatSessions {
  /**
   * Every readable chat of the workspace at `location` (its resolved real path, as in a
   * `TrustRecord`), most recently used first, then by id.
   */
  list(location: string): Promise<SavedChatSummary[]>;
  /** One chat, or `null` when there is none or it can't be read. */
  load(location: string, id: string): Promise<SavedChat | null>;
  /**
   * Saves a chat, replacing any chat with the same id in that workspace.
   *
   * @throws RangeError when the id doesn't match {@link savedChatIdPattern}
   */
  save(location: string, chat: SavedChat): Promise<void>;
  /** Deletes one chat, even one that can't be read. Deleting one that isn't there is not an error. */
  delete(location: string, id: string): Promise<void>;
}

const roles = new Set(["system", "user", "assistant", "tool"]);
const aboutKinds: ReadonlySet<unknown> = new Set(savedChatAboutKinds);

/**
 * Whether `value` is a {@link SavedChat}: every field with its type, an id that matches
 * {@link savedChatIdPattern}, a known kind and model, an `about` (when there is one) with a known kind and a hub and id that
 * aren't empty, and messages that each have a known role and
 * text content. Adapters check what they read with it.
 *
 * @example
 * const chat = isSavedChat(JSON.parse(text)) ? JSON.parse(text) : null;
 */
export function isSavedChat(value: unknown): value is SavedChat {
  if (typeof value !== "object" || value === null) return false;
  const chat = value as { readonly [Field in keyof SavedChat]?: unknown };
  return (
    typeof chat.id === "string" &&
    savedChatIdPattern.test(chat.id) &&
    (chat.kind === "build" || (typeof chat.kind === "string" && /^agent:.+/u.test(chat.kind))) &&
    typeof chat.title === "string" &&
    typeof chat.lastUsedAt === "string" &&
    typeof chat.answering === "boolean" &&
    isModel(chat.model) &&
    (chat.about === undefined || isAbout(chat.about)) &&
    Array.isArray(chat.messages) &&
    chat.messages.every(isMessage) &&
    (chat.docs === undefined || isDocs(chat.docs))
  );
}

const siteAnswers: ReadonlySet<unknown> = new Set(["asked", "allowed", "declined"]);
const docsOutcomes: ReadonlySet<unknown> = new Set([
  "read",
  "moved",
  "not-read",
  "waiting",
  "declined",
  "refused",
  "untrusted",
]);

function isDocs(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const docs = value as { sites?: unknown; log?: unknown };
  return (
    Array.isArray(docs.sites) &&
    docs.sites.every(isDocsSite) &&
    Array.isArray(docs.log) &&
    docs.log.every(isDocsLogEntry)
  );
}

function isDocsSite(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const site = value as { host?: unknown; answer?: unknown; cardId?: unknown };
  return (
    typeof site.host === "string" &&
    site.host !== "" &&
    siteAnswers.has(site.answer) &&
    typeof site.cardId === "string"
  );
}

function isDocsLogEntry(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as { readonly [Field in keyof SavedDocsLogEntry]?: unknown };
  return (
    typeof entry.callId === "string" &&
    typeof entry.at === "string" &&
    typeof entry.url === "string" &&
    docsOutcomes.has(entry.outcome) &&
    (entry.status === undefined || typeof entry.status === "number") &&
    typeof entry.bytes === "number" &&
    (entry.location === undefined || typeof entry.location === "string")
  );
}

function isModel(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const model = value as { kind?: unknown; name?: unknown };
  return model.kind === "assistant" || (model.kind === "alias" && typeof model.name === "string");
}

function isAbout(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const about = value as { kind?: unknown; hub?: unknown; id?: unknown };
  return (
    aboutKinds.has(about.kind) &&
    typeof about.hub === "string" &&
    about.hub !== "" &&
    typeof about.id === "string" &&
    about.id !== ""
  );
}

function isMessage(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const message = value as { role?: unknown; content?: unknown };
  return (
    typeof message.role === "string" &&
    roles.has(message.role) &&
    typeof message.content === "string"
  );
}
