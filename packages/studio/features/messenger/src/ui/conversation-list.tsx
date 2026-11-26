import type { MessagingId } from "@halonicjs/ports";
import { Avatar, clockTime } from "@halonicjs/studio-kit";
import { useRef } from "react";
import { channelSize, isChannel, workingMembers } from "../channel.ts";
import { chatAgent, chatName } from "../chat-name.ts";
import type { ConversationRow } from "../messenger.ts";
import { messengerWords } from "../messenger-words.ts";
import { type AgentPictures, pictureOf } from "./agent-pictures.ts";
import { Highlighted } from "./chat-search.tsx";
import { ChatsSkeleton, useFadeIn } from "./load-states.tsx";

/** The props of {@link ConversationList}. */
export interface ConversationListProps {
  /** The conversations, newest first; undefined until the first read landed. */
  readonly rows: readonly ConversationRow[] | undefined;
  /** Reads the chats again: the skeleton's Try again. */
  readonly onRetry: () => void;
  readonly selected: MessagingId | undefined;
  readonly onSelect: (conversation: MessagingId) => void;
  /** Each chat agent's picture, read once; a row without one shows its initial. */
  readonly pictures: AgentPictures;
  /** The Messenger's clock, for each row's time. */
  readonly now: Date;
  /** How many agent's messages in a row the person hasn't seen: its count badge. */
  readonly unread: (row: ConversationRow) => number;
  /** The chats come from more than one source, so each chat's row names its own. */
  readonly manySources: boolean;
  /**
   * While a chat search is open, what it searched for: each row shows the line that holds it,
   * marked (`messenger.chat-search`).
   */
  readonly search?: { readonly text: string; readonly lines: ReadonlyMap<MessagingId, string> };
}

/**
 * The Messenger's list (HAL-17421 render 4a, with the changes approved on HAL-19132): one row per
 * conversation with its name, its newest message and its time, a violet dot after the name while a
 * card or question waits for the person, and a count of the messages the person hasn't seen
 * (`messenger.chat-rows`). A row names its source only when the chats come from more than one. The
 * open conversation's row is marked current and shows no count. Until the chats are read, skeleton
 * rows stand in its place (`messenger.load-states`).
 */
export function ConversationList({
  rows,
  onRetry,
  selected,
  onSelect,
  pictures,
  now,
  unread,
  manySources,
  search,
}: ConversationListProps) {
  // The rows fade in once they arrive in the skeleton's place.
  const list = useRef<HTMLUListElement>(null);
  useFadeIn(list, rows !== undefined);
  if (rows === undefined) return <ChatsSkeleton onRetry={onRetry} />;
  if (rows.length === 0) {
    return <p className="px-2 py-4 text-small text-fg-muted">{messengerWords.noChats}</p>;
  }
  return (
    <ul ref={list} aria-label={messengerWords.chatsLabel} className="flex flex-col gap-1">
      {rows.map((row) => {
        const current = row.conversation.id === selected;
        return (
          <li key={row.conversation.id}>
            <Row
              row={row}
              current={current}
              onSelect={onSelect}
              picture={pictureOf(pictures, row)}
              now={now}
              unread={current ? 0 : unread(row)}
              named={manySources}
              line={search?.lines.get(row.conversation.id) ?? rowLine(row)}
              highlight={search?.text ?? ""}
            />
          </li>
        );
      })}
    </ul>
  );
}

/** What a row says under its name: for a channel, who is working; else the newest message. */
function rowLine(row: ConversationRow): string {
  const working = isChannel(row) ? workingMembers(row) : undefined;
  return working ?? preview(row);
}

/** After a row's name: a channel's size (k14a); a chat's source, when the list has two. */
function afterName(row: ConversationRow, named: boolean): string | undefined {
  if (isChannel(row)) return channelSize(row);
  return named ? row.source?.label : undefined;
}

/** Whether a card or a question in the row waits for the person: the violet dot. */
function waitsForPerson(row: ConversationRow): boolean {
  return (row.openCards ?? 0) > 0 || (row.questions ?? []).length > 0;
}

function preview({ last }: ConversationRow): string {
  if (last === undefined) return "";
  const line = last.body.trim().split("\n")[0] ?? "";
  return last.author.kind === "me" ? `${messengerWords.youSaid}${line}` : line;
}

function Row({
  row,
  current,
  onSelect,
  picture,
  now,
  unread,
  named,
  line,
  highlight,
}: {
  readonly row: ConversationRow;
  readonly current: boolean;
  readonly onSelect: (conversation: MessagingId) => void;
  readonly picture: ImageBitmap | undefined;
  readonly now: Date;
  /** How many messages the person hasn't seen; 0 shows no badge. */
  readonly unread: number;
  /** The list holds more than one source, so a chat's row names its own. */
  readonly named: boolean;
  /** What the row says under its name. */
  readonly line: string;
  /** What a chat search searched for, marked in the row; empty with none. */
  readonly highlight: string;
}) {
  const after = afterName(row, named);
  return (
    <button
      type="button"
      data-chat={row.conversation.id}
      aria-current={current ? "true" : undefined}
      onClick={() => onSelect(row.conversation.id)}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-start transition-colors duration-(--duration-fast) ease-standard hover:bg-surface-muted focus-ring aria-[current=true]:bg-surface-muted"
    >
      <Avatar name={chatAgent(row)?.name ?? row.conversation.title} picture={picture} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-baseline gap-2">
          {/* The dot sits outside the truncated name, so a long name's ellipsis never hides it. */}
          <span className="flex min-w-0 flex-1 items-center">
            <span className="min-w-0 truncate text-body">
              <bdi>
                <Highlighted text={chatName(row)} term={highlight} />
              </bdi>
              {after === undefined ? null : (
                <span className="text-small text-fg-muted"> · {after}</span>
              )}
            </span>
            {waitsForPerson(row) ? (
              <span data-needs-you className="ms-1.5 size-1.5 shrink-0 rounded-full bg-warning">
                <span className="sr-only">{messengerWords.needsYouDot}</span>
              </span>
            ) : null}
          </span>
          {row.last === undefined ? null : (
            <span className="shrink-0 text-small text-fg-muted">
              {clockTime(new Date(row.last.sentAt), now)}
            </span>
          )}
        </span>
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-small text-fg-muted">
            <Highlighted text={line} term={highlight} />
          </span>
          {unread === 0 ? null : <UnreadBadge count={unread} />}
        </span>
      </span>
    </button>
  );
}

/** The blue count of a row's unread messages, "99+" past 99. */
function UnreadBadge({ count }: { readonly count: number }) {
  return (
    <span
      data-unread
      className="inline-flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-caption text-on-primary"
    >
      {messengerWords.unreadCount(count)}
      <span className="sr-only">{messengerWords.unread}</span>
    </span>
  );
}
