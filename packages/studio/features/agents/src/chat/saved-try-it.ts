import {
  chatsToDrop,
  chatToSave,
  draftTitle,
  restoredChat,
  titleAfterSend,
} from "@halonicjs/assistant";
import type { ChatMessage, SavedChatKind } from "@halonicjs/ports";
import type { AgentRef, SavedChatsPlace } from "../api.ts";
import { type Transcript, transcriptOf } from "./transcript.ts";

/** A Try it chat as it was saved: its id in the store, and what it shows again. */
export interface SavedTryIt {
  readonly id: string;
  readonly transcript: Transcript;
}

/** What {@link saveTryIt} saves. */
export interface TryItToSave {
  /** The chat's id in the store, the same for every turn of one chat. */
  readonly id: string;
  readonly agent: AgentRef;
  readonly conversation: readonly ChatMessage[];
  readonly now: Date;
}

/** The kind of an agent's Try it chats in the store: `agent:<hub>/<id>`. */
export function tryItKindOf(agent: AgentRef): SavedChatKind {
  return `agent:${agent.hubId}/${agent.id}`;
}

/** A new chat's id in the store, from the time it was first saved. */
export function newTryItId(now: Date): string {
  return `try-it-${now.getTime()}`;
}

/**
 * The agent's most recently used Try it chat, or `undefined` when it has none or it can't be read.
 * Only the conversation is saved, so its turns are rebuilt from it.
 */
export async function loadTryIt(
  place: SavedChatsPlace,
  agent: AgentRef,
): Promise<SavedTryIt | undefined> {
  const kind = tryItKindOf(agent);
  const summary = (await place.sessions.list(place.location)).find((each) => each.kind === kind);
  if (summary === undefined) return undefined;
  const saved = await place.sessions.load(place.location, summary.id);
  if (saved === null) return undefined;
  const { chat } = restoredChat(saved);
  return { id: chat.id, transcript: transcriptOf(chat.messages) };
}

/**
 * Saves a Try it chat at the end of a turn, by the Build chats' rules (`@halonicjs/assistant`): a
 * draft is never saved, its title comes from its first message, and the workspace keeps its 40
 * most recently used chats, Build and agent chats together.
 */
export async function saveTryIt(
  place: SavedChatsPlace,
  { id, agent, conversation, now }: TryItToSave,
): Promise<void> {
  const first = conversation.find((message) => message.role === "user");
  const chat = chatToSave({
    id,
    kind: tryItKindOf(agent),
    title: titleAfterSend(draftTitle, first?.content ?? ""),
    lastUsedAt: now.toISOString(),
    // Saved once the turn ends, so never answering.
    answering: false,
    // An agent chat uses its agent's model; the field is there for Build chats.
    model: { kind: "assistant" },
    messages: [...conversation],
  });
  if (chat === null) return;
  await place.sessions.save(place.location, chat);
  for (const old of chatsToDrop(await place.sessions.list(place.location))) {
    await place.sessions.delete(place.location, old);
  }
}
