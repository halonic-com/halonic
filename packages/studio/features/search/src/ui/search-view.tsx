import type { SearchHit } from "@halonicjs/ports";
import { useSyncExternalStore } from "react";
import type { SearchKindGroup } from "../search-results.ts";
import type { SearchStore } from "../search-store.ts";

/** Props for {@link SearchView}. */
export interface SearchViewProps {
  readonly store: SearchStore;
  /** Opens a hit in its app: an agent or a chat in Messenger, an inbox item in Inbox, work in the overview. */
  readonly onOpen: (hit: SearchHit) => void;
}

/**
 * A search box over every `AgentMessaging` source, with the hits grouped by
 * kind and then by source. Titles and excerpts are agent-written, so they
 * are drawn as plain text only: no Markdown, HTML, links or images.
 */
export function SearchView({ store, onOpen }: SearchViewProps) {
  const state = useSyncExternalStore(store.subscribe, store.snapshot);
  return (
    <div className="flex flex-col gap-4 px-4 py-3">
      <input
        type="search"
        aria-label="Search agents, chats, inbox and work"
        placeholder="Search agents, chats, inbox and work"
        className="rounded border border-border px-2 py-1"
        onChange={(event) => void store.search(event.currentTarget.value)}
      />
      {state.kind === "searching" ? <p className="text-fg-muted">Searching…</p> : null}
      {state.kind === "failed" ? <p className="text-danger">The search didn't work.</p> : null}
      {state.kind === "ready" && state.groups.length === 0 ? (
        <p className="text-fg-muted">{`Nothing matches “${state.query}”.`}</p>
      ) : null}
      {state.kind === "ready"
        ? state.groups.map((group) => (
            <KindSection key={group.kind} group={group} onOpen={onOpen} />
          ))
        : null}
    </div>
  );
}

function KindSection(props: {
  readonly group: SearchKindGroup;
  readonly onOpen: (hit: SearchHit) => void;
}) {
  const { group, onOpen } = props;
  const headingId = `search-${group.kind}`;
  return (
    <section aria-labelledby={headingId} data-kind={group.kind}>
      <h2 id={headingId} className="text-heading">
        {kindWords[group.kind]}
      </h2>
      {group.sources.map((source) => (
        <div key={source.source} data-source={source.source}>
          <h3 className="text-small text-fg-muted">{source.label}</h3>
          <ul>
            {source.hits.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  className="w-full py-1 text-start"
                  onClick={() => onOpen(hit)}
                >
                  {hit.title === "" ? null : <span className="font-medium">{hit.title}</span>}
                  {hit.excerpt === "" ? null : (
                    <span className="block text-small text-fg-muted">{hit.excerpt}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

const kindWords: Readonly<Record<SearchHit["kind"], string>> = {
  agent: "Agents",
  conversation: "Chats",
  message: "Messages",
  "inbox-item": "Inbox",
  work: "Work",
};
