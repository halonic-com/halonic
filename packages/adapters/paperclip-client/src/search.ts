import type {
  Conversation,
  InboxItem,
  MessagingAgent,
  SearchHit,
  WorkItem,
} from "@halonicjs/ports";

/** What a search looks through: the lists the provider just read. */
export interface Searchable {
  agents: readonly MessagingAgent[];
  conversations: readonly Conversation[];
  inbox: readonly InboxItem[];
  work: readonly WorkItem[];
}

const excerptLength = 120;

/** Up to {@link excerptLength} characters of `text` around where `query` starts. */
function excerptOf(text: string, start: number): string {
  const from = Math.max(0, start - excerptLength / 4);
  return text.slice(from, from + excerptLength);
}

/** A hit when `text` holds `query`, ignoring case. */
function hitIn(text: string, query: string, hit: Omit<SearchHit, "excerpt">): SearchHit[] {
  const start = text.toLowerCase().indexOf(query);
  return start === -1 ? [] : [{ ...hit, excerpt: excerptOf(text, start) }];
}

/**
 * Agents, conversations, inbox items and work whose name, title or question
 * holds `query`, ignoring case. Paperclip has no search route on the
 * request list, so the provider searches what it read; messages aren't
 * searched, since that would read every chat.
 */
export function searchAll(query: string, lists: Searchable): SearchHit[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return [];
  }
  return [
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
    ...lists.inbox.flatMap((item) =>
      hitIn(item.question, needle, {
        kind: "inbox-item",
        id: item.id,
        source: item.source,
        title: item.question.split("\n")[0] ?? "",
      }),
    ),
    ...lists.work.flatMap((work) =>
      hitIn(`${work.label} ${work.title}`, needle, {
        kind: "work",
        id: work.id,
        source: work.source,
        title: work.title,
      }),
    ),
  ];
}
