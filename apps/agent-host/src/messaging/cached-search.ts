import type {
  Conversation,
  InboxItem,
  Message,
  MessagingAgent,
  MessagingId,
  SearchHit,
  WorkItem,
} from "@halonicjs/ports";
import type { MessagingCacheFolder } from "./messaging-cache-folder.ts";

/**
 * A search of what the cache holds for an offline source: every cached item
 * whose title or text holds `text`, ignoring case, as the source's own search
 * would find it.
 */
export async function searchCached(
  cache: MessagingCacheFolder,
  source: MessagingId,
  text: string,
): Promise<SearchHit[]> {
  const wanted = text.toLowerCase();
  const hit = (kind: SearchHit["kind"], id: MessagingId, title: string, excerpt: string) =>
    `${title}\n${excerpt}`.toLowerCase().includes(wanted)
      ? [{ kind, id, source, title, excerpt }]
      : [];
  const [agents, conversations, inbox, work, messages] = await Promise.all([
    cache.loadList<MessagingAgent>(source, "agents"),
    cache.loadList<Conversation>(source, "conversations"),
    cache.loadList<InboxItem>(source, "inbox"),
    cache.loadList<WorkItem>(source, "work"),
    cache.loadAllMessages<Message>(source),
  ]);
  return [
    ...(agents?.items ?? []).flatMap((agent) =>
      hit("agent", agent.id, agent.name, agent.title ?? ""),
    ),
    ...(conversations?.items ?? []).flatMap((chat) => hit("conversation", chat.id, chat.title, "")),
    ...messages.flatMap((message) => hit("message", message.id, "", message.body)),
    ...(inbox?.items ?? []).flatMap((item) => hit("inbox-item", item.id, "", item.question)),
    ...(work?.items ?? []).flatMap((each) => hit("work", each.id, each.label, each.title)),
  ];
}
