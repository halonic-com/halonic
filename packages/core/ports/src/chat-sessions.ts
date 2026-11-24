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
 *   messages: [{ role: "user", content: "Add a routine" }],
 * };
 */
export interface SavedChat extends SavedChatSummary {
  model: SavedChatModel;
  /** The conversation, oldest first, as the model sees it. */
  messages: ChatMessage[];
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

/**
 * Whether `value` is a {@link SavedChat}: every field with its type, an id that matches
 * {@link savedChatIdPattern}, a known kind and model, and messages that each have a known role and
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
    Array.isArray(chat.messages) &&
    chat.messages.every(isMessage)
  );
}

function isModel(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const model = value as { kind?: unknown; name?: unknown };
  return model.kind === "assistant" || (model.kind === "alias" && typeof model.name === "string");
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
