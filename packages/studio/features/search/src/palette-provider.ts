import type { AgentMessaging, SearchHit } from "@halonicjs/ports";
import type { SearchResult, SidebarPlace } from "@halonicjs/studio-shell";

/**
 * The place that lists each kind of hit, which Ctrl K opens for it. Chats and messages live in
 * Messenger's own window, which Ctrl K can't open yet, so the palette leaves them out; the Search
 * view still finds them.
 */
const hitPlaces: Readonly<Partial<Record<SearchHit["kind"], SidebarPlace>>> = {
  agent: "overview",
  "inbox-item": "inbox",
  work: "overview",
};

/** Each kind's word in a row's detail, before the source's label, as in "Work · Paperclip · Acme". */
const hitKindWords: Readonly<Record<SearchHit["kind"], string>> = {
  agent: "Agent",
  conversation: "Chat",
  message: "Message",
  "inbox-item": "Inbox",
  work: "Work",
};

/**
 * Searches `messaging` for Ctrl K and the Search page (requirement `search.palette`): its
 * agents, inbox items and work, such as a Paperclip's tasks, each opening the place that lists
 * it. A blank query asks nothing. Titles and excerpts are agent-written: the palette draws them
 * as plain text.
 */
export async function searchForPalette(
  messaging: AgentMessaging,
  query: string,
): Promise<readonly SearchResult[]> {
  const text = query.trim();
  if (text === "") return [];
  const [hits, sources] = await Promise.all([messaging.search(text), messaging.listSources()]);
  const results: SearchResult[] = [];
  for (const hit of hits) {
    const place = hitPlaces[hit.kind];
    if (place === undefined) continue;
    const sourceLabel = sources.find((source) => source.id === hit.source)?.label ?? hit.source;
    results.push({
      item: { kind: `messaging-${hit.kind}`, hub: hit.source, id: hit.id },
      label: hit.title === "" ? hit.excerpt : hit.title,
      detail: `${hitKindWords[hit.kind]} · ${sourceLabel}`,
      hubName: sourceLabel,
      ...(hit.excerpt === "" ? {} : { description: hit.excerpt }),
      place,
    });
  }
  return results;
}
