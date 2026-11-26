import { Input, SearchIcon } from "@halonicjs/studio-kit";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import type { FoundChat } from "../chat-search.ts";
import { listWords } from "../list-words.ts";
import type { ConversationRow, Messenger } from "../messenger.ts";
import { messengerWords } from "../messenger-words.ts";

const words = listWords.search;

/**
 * The chat search (`messenger.chat-search`): `search` is undefined while it is closed. Ctrl+K (Cmd+K
 * on macOS) opens it and puts focus in its field while the Messenger shows; the Studio's command
 * palette leaves a Ctrl+K handled here alone, so everywhere else it stays the palette. `found` is
 * what the open search found, read again as the text or the chats change; a late answer never
 * replaces a newer one's.
 */
export function useChatSearch(messenger: Messenger, rows: readonly ConversationRow[] | undefined) {
  const [search, setSearch] = useState<string | undefined>(undefined);
  const [found, setFound] = useState<readonly FoundChat[] | undefined>(undefined);
  const field = useRef<HTMLInputElement>(null);
  const reads = useRef(0);

  useEffect(() => {
    // Capture runs before the palette's own listener, which skips a key already handled.
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      setSearch((before) => before ?? "");
      field.current?.focus();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => {
    reads.current += 1;
    const thisRead = reads.current;
    if (search === undefined || rows === undefined) return setFound(undefined);
    messenger.findChats(rows, search).then(
      (chats) => {
        if (thisRead === reads.current) setFound(chats);
      },
      (error: unknown) => console.error("The chat search failed:", error),
    );
  }, [messenger, rows, search]);

  return { search, setSearch, found, field };
}

/**
 * Over the list: "Chats", the search icon (Ctrl+K) and **New ▾**; while the search is open, its
 * field and "Esc" in their place, and how many chats it found under them (Sofia's sketch A on
 * HAL-19134). Escape closes it and puts focus back on the icon.
 */
export function ListHeader({
  search,
  onSearch,
  field,
  found,
  newMenu,
}: {
  readonly search: string | undefined;
  readonly onSearch: (search: string | undefined) => void;
  readonly field: RefObject<HTMLInputElement | null>;
  readonly found: number | undefined;
  /** **New ▾**, or nothing where nothing can be made yet. */
  readonly newMenu: ReactNode;
}) {
  const icon = useRef<HTMLButtonElement>(null);
  // Once the search closes, focus goes back to the icon that opened it.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (search === undefined && wasOpen.current) icon.current?.focus();
    wasOpen.current = search !== undefined;
  }, [search]);
  if (search === undefined) {
    return (
      <div className="flex items-center gap-2 px-3 pt-2">
        <h2 className="min-w-0 flex-1 text-body-strong">{messengerWords.chatsLabel}</h2>
        <button
          ref={icon}
          type="button"
          data-chat-search
          title={words.button}
          aria-label={words.button}
          onClick={() => onSearch("")}
          className="rounded-sm p-1 text-fg-muted hover:text-fg focus-ring *:size-4"
        >
          <SearchIcon />
        </button>
        {newMenu}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 px-2 pt-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Input
            ref={field}
            size="sm"
            type="search"
            leadingIcon={<SearchIcon />}
            autoFocus
            aria-label={words.label}
            placeholder={words.label}
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") onSearch(undefined);
            }}
          />
        </div>
        <kbd className="rounded-xs border border-border px-1 text-caption text-fg-muted">
          {words.close}
        </kbd>
      </div>
      <p role="status" className="px-1 text-small text-fg-muted">
        {found === undefined || search.trim() === "" ? "" : foundLine(found)}
      </p>
    </div>
  );
}

function foundLine(count: number): string {
  return count === 0 ? words.noMatches : words.count(count);
}

/** `text` with each place that holds `term` marked, ignoring case. */
export function Highlighted({ text, term }: { readonly text: string; readonly term: string }) {
  const wanted = term.trim().toLowerCase();
  if (wanted === "") return <>{text}</>;
  const parts: ReactNode[] = [];
  let from = 0;
  let at = text.toLowerCase().indexOf(wanted);
  while (at !== -1) {
    parts.push(text.slice(from, at));
    parts.push(
      <mark key={at} className="rounded-xs bg-accent-soft text-fg">
        {text.slice(at, at + wanted.length)}
      </mark>,
    );
    from = at + wanted.length;
    at = text.toLowerCase().indexOf(wanted, from);
  }
  parts.push(text.slice(from));
  return <>{parts}</>;
}
