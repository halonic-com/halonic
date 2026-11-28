import type { MessagingId } from "@halonicjs/ports";
import type { EngineWords } from "@halonicjs/studio-shell";
import { type ReactNode, useEffect, useReducer, useState } from "react";
import { pinnedFirst } from "../chat-pins.ts";
import type { FoundChat } from "../chat-search.ts";
import type { ConversationRow, Messenger } from "../messenger.ts";
import { messengerWords } from "../messenger-words.ts";
import type { WaitingCard } from "../needs-you.ts";
import type { AgentPictures } from "./agent-pictures.ts";
import { ListHeader, useChatSearch } from "./chat-search.tsx";
import { ConversationList, type RowMarks } from "./conversation-list.tsx";
import { ChatsLoad } from "./load-states.tsx";
import { NeedsYouEntry } from "./needs-you.tsx";
import { useChatPins } from "./use-chat-pins.tsx";

/**
 * The chats the Messenger lists, read when it opens and whenever a source says it changed, whether
 * anything is connected, and the last read's failure.
 */
export function useChats(messenger: Messenger) {
  // Undefined until the first read lands, so the page shows its skeleton, not "No chats yet".
  const [rows, setRows] = useState<readonly ConversationRow[] | undefined>(undefined);
  // Unknown until the first read lands, so the page never flashes "No connections".
  const [connected, setConnected] = useState<boolean | undefined>(undefined);
  // The last read's failure; a read that lands clears it.
  const [failure, setFailure] = useState<unknown>(undefined);
  // Grows on each change a source reports, so the list and the open conversation read again.
  const [changed, setChanged] = useState(0);

  useEffect(() => messenger.watch(() => setChanged((count) => count + 1)), [messenger]);

  useEffect(() => {
    let current = true;
    Promise.all([messenger.rows(), messenger.hasSources()]).then(
      ([read, hasSources]) => {
        if (!current) return;
        setRows(read);
        setConnected(hasSources);
        setFailure(undefined);
      },
      (error: unknown) => {
        console.error("The Messenger couldn't read its chats:", error);
        if (current) setFailure(error);
      },
    );
    return () => {
      current = false;
    };
  }, [messenger, changed]);

  const readAgain = () => setChanged((count) => count + 1);
  return { rows, connected, failure, changed, readAgain };
}

/**
 * The list column's contents: "Chats" with the search icon and **New ▾** (or the open search),
 * the "Needs you" entry, and the chats, or what the search found (HAL-19132).
 */
export function ChatsColumn({
  messenger,
  rows,
  connected,
  failure,
  words,
  onRetry,
  selected,
  onSelect,
  pictures,
  waiting,
  needsYou,
  onNeedsYou,
  newMenu,
}: {
  readonly messenger: Messenger;
  readonly rows: readonly ConversationRow[] | undefined;
  readonly connected: boolean | undefined;
  readonly failure: unknown;
  readonly words: EngineWords;
  readonly onRetry: () => void;
  readonly selected: MessagingId | undefined;
  readonly onSelect: (conversation: MessagingId) => void;
  readonly pictures: AgentPictures;
  readonly waiting: readonly WaitingCard[] | undefined;
  /** The "Needs you" panel is open. */
  readonly needsYou: boolean;
  readonly onNeedsYou: () => void;
  readonly newMenu: ReactNode;
}) {
  const chatSearch = useChatSearch(messenger, rows);
  // A mark changes only what this device keeps, so the rows draw again without asking the source.
  const [, onMarked] = useReducer((count: number) => count + 1, 0);
  const marks: RowMarks = {
    canMarkUnread: (row) => messenger.canMarkUnread(row),
    onMarkRead: (row) => {
      messenger.markRead(row);
      onMarked();
    },
    onMarkUnread: (row) => {
      messenger.markUnread(row);
      onMarked();
    },
  };
  const found = chatSearch.search === undefined ? undefined : chatSearch.found;
  const pins = useChatPins();
  // A search lists what it found in its own order; otherwise the pinned chats come first.
  const split =
    found === undefined && rows !== undefined ? pinnedFirst(rows, pins?.pinned ?? []) : undefined;
  return (
    <>
      {/* Also while the chats load, so the list doesn't move once they arrive (motion 7); not over
          "Couldn't load your chats", where nothing can be made yet. */}
      {connected === false || (rows === undefined && failure !== undefined) ? null : (
        <ListHeader
          search={chatSearch.search}
          onSearch={chatSearch.setSearch}
          field={chatSearch.field}
          found={found?.length}
          newMenu={newMenu}
        />
      )}
      <PinsFullNote full={pins?.full === true} />
      {rows === undefined || chatSearch.search !== undefined ? null : (
        <div className="mx-2 mt-2 border-b border-border pb-2">
          <NeedsYouEntry count={waiting?.length ?? 0} current={needsYou} onOpen={onNeedsYou} />
        </div>
      )}
      {/* Only the rows scroll, inside the sidebar; the search and Needs you stay put
          (`messenger.chats-scroll`). */}
      <div data-chats-scroll="" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pt-2">
        <ChatsLoad loaded={rows !== undefined} error={failure} words={words} onRetry={onRetry}>
          <ConversationList
            rows={found === undefined ? (split?.others ?? rows) : found.map((each) => each.row)}
            pinned={split?.pinned ?? []}
            {...(found === undefined
              ? {}
              : { search: { text: chatSearch.search ?? "", lines: linesOf(found) } })}
            onRetry={onRetry}
            selected={selected}
            onSelect={onSelect}
            pictures={pictures}
            now={messenger.now()}
            unread={(row) => messenger.unreadCount(row)}
            marks={marks}
            manySources={new Set(rows?.map((row) => row.conversation.source)).size > 1}
          />
        </ChatsLoad>
      </div>
    </>
  );
}

/** The line each found chat shows: the one that holds what was searched for, if any. */
function linesOf(found: readonly FoundChat[]): ReadonlyMap<MessagingId, string> {
  return new Map(
    found.flatMap((each) =>
      each.line === undefined ? [] : [[each.row.conversation.id, each.line] as const],
    ),
  );
}

/** "You can pin up to 3 chats." under the list's header, while the last pin found them all taken. */
function PinsFullNote({ full }: { readonly full: boolean }) {
  if (!full) return null;
  return (
    <p role="status" className="px-5 pt-1 text-small text-fg-muted">
      {messengerWords.pinsFull}
    </p>
  );
}
