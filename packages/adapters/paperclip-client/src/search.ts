import type {
  Conversation,
  InboxItem,
  MessagingAgent,
  MessagingId,
  SearchHit,
} from "@halonicjs/ports";
import { type JsonRecord, text } from "./json.ts";
import { type MapContext, toWork } from "./map.ts";

/** What a search looks through: Paperclip's matching tasks, and the lists the provider read. */
export interface Searchable {
  agents: readonly MessagingAgent[];
  conversations: readonly Conversation[];
  /** The Inbox as the provider last read it; searching reads no cards. */
  inbox: readonly InboxItem[];
  /** The tasks Paperclip's issue search (`searchTasks`) answered with. */
  tasks: readonly JsonRecord[];
}

const excerptLength = 120;

/** Up to {@link excerptLength} characters of `text` around where the match starts. */
function excerptOf(text: string, start: number): string {
  const from = Math.max(0, start - excerptLength / 4);
  return text.slice(from, from + excerptLength);
}

/** A hit when `text` holds `needle` (already lower case), ignoring case. */
function hitIn(text: string, needle: string, hit: Omit<SearchHit, "excerpt">): SearchHit[] {
  const start = text.toLowerCase().indexOf(needle);
  return start === -1 ? [] : [{ ...hit, excerpt: excerptOf(text, start) }];
}

/**
 * The excerpt of a task Paperclip matched: around the match in its title or
 * description, or the title's start when Paperclip matched something the
 * list doesn't carry, such as a comment.
 */
function taskExcerpt(record: JsonRecord, needle: string): string {
  for (const field of ["title", "description"]) {
    const value = text(record, field) ?? "";
    const start = value.toLowerCase().indexOf(needle);
    if (start !== -1) {
      return excerptOf(value, start);
    }
  }
  return excerptOf(text(record, "title") ?? "", 0);
}

/** Paperclip's matching tasks as hits: a chat task as its conversation, any other as work. */
function taskHits(
  context: MapContext,
  needle: string,
  tasks: readonly JsonRecord[],
  chats: ReadonlyMap<MessagingId, Conversation>,
): SearchHit[] {
  return tasks.flatMap((record): SearchHit[] => {
    const work = toWork(context, record);
    const task = text(record, "id");
    if (work === undefined || task === undefined) {
      return [];
    }
    const excerpt = taskExcerpt(record, needle);
    const chat = chats.get(context.ids.make("chat", task));
    if (chat !== undefined) {
      return [
        { kind: "conversation", id: chat.id, source: chat.source, title: chat.title, excerpt },
      ];
    }
    return [{ kind: "work", id: work.id, source: work.source, title: work.title, excerpt }];
  });
}

/** `hits` without a second hit for the same kind and ID; the first one stays. */
function withoutRepeats(hits: readonly SearchHit[]): SearchHit[] {
  const seen = new Set<string>();
  return hits.filter((hit) => {
    const key = `${hit.kind} ${hit.id}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Agents whose name holds `query`, chats whose title does, inbox items whose
 * question does (ignoring case), and the tasks Paperclip's issue search
 * matched: chat tasks as conversations, the rest as work. Messages aren't
 * searched one by one, since that would read every chat, and documents stay
 * out in phase 1 (HAL-17447). The caller makes no request for a blank query.
 */
export function searchAll(query: string, lists: Searchable, context: MapContext): SearchHit[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return [];
  }
  const chats = new Map(lists.conversations.map((chat) => [chat.id, chat] as const));
  const fromTasks = taskHits(context, needle, lists.tasks, chats);
  return withoutRepeats([
    ...lists.agents.flatMap((agent) =>
      hitIn(agent.name, needle, {
        kind: "agent",
        id: agent.id,
        source: agent.source,
        title: agent.name,
      }),
    ),
    ...lists.conversations.flatMap((chat) =>
      hitIn(chat.title, needle, {
        kind: "conversation",
        id: chat.id,
        source: chat.source,
        title: chat.title,
      }),
    ),
    ...fromTasks.filter((hit) => hit.kind === "conversation"),
    ...lists.inbox.flatMap((item) =>
      hitIn(item.question, needle, {
        kind: "inbox-item",
        id: item.id,
        source: item.source,
        title: item.question.split("\n")[0] ?? "",
      }),
    ),
    ...fromTasks.filter((hit) => hit.kind === "work"),
  ]);
}
