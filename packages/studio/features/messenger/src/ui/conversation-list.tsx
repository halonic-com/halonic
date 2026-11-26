import type { MessagingId } from "@halonicjs/ports";
import { Avatar, PlainList, PlainRow, type PlainRowAction, TimeStamp } from "@halonicjs/studio-kit";
import { useRef } from "react";
import { chatTint } from "../agent-tint.ts";
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
  /**
   * A row's hover action (`messenger.read-marks`): **Mark as read** while it counts messages,
   * **Mark as unread** once read while an agent's message is newer than the person's own.
   */
  readonly marks?: RowMarks | undefined;
  /** The chats come from more than one source, so each chat's row names its own. */
  readonly manySources: boolean;
  /**
   * While a chat search is open, what it searched for: each row shows the line that holds it,
   * marked (`messenger.chat-search`).
   */
  readonly search?: { readonly text: string; readonly lines: ReadonlyMap<MessagingId, string> };
}

/** What a row's **Mark as read** and **Mark as unread** do. */
export interface RowMarks {
  readonly canMarkUnread: (row: ConversationRow) => boolean;
  readonly onMarkRead: (row: ConversationRow) => void;
  readonly onMarkUnread: (row: ConversationRow) => void;
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
  marks,
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
    <PlainList listRef={list} label={messengerWords.chatsLabel}>
      {rows.map((row) => {
        const current = row.conversation.id === selected;
        const count = current ? 0 : unread(row);
        return (
          <Row
            key={row.conversation.id}
            row={row}
            current={current}
            onSelect={onSelect}
            picture={pictureOf(pictures, row)}
            now={now}
            unread={count}
            action={current ? undefined : rowAction(row, count, marks)}
            named={manySources}
            line={search?.lines.get(row.conversation.id) ?? rowLine(row)}
            highlight={search?.text ?? ""}
          />
        );
      })}
    </PlainList>
  );
}

/**
 * A row's hover action: **Mark as read** while it counts messages, else **Mark as unread** while an
 * agent's message is newer than the person's own; none for the open chat, which reads them. A
 * screen reader hears the chat's name after it, so the buttons in a list aren't all alike.
 */
function rowAction(
  row: ConversationRow,
  count: number,
  marks: RowMarks | undefined,
): PlainRowAction | undefined {
  if (marks === undefined) return undefined;
  if (count > 0) {
    return {
      label: messengerWords.markRead,
      spokenLabel: messengerWords.markReadFor(chatName(row)),
      onClick: () => marks.onMarkRead(row),
    };
  }
  if (!marks.canMarkUnread(row)) return undefined;
  return {
    label: messengerWords.markUnread,
    spokenLabel: messengerWords.markUnreadFor(chatName(row)),
    onClick: () => marks.onMarkUnread(row),
  };
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

/** One conversation's row, drawn by the kit's plain row, as the Inbox's items are (HAL-19192). */
function Row({
  row,
  current,
  onSelect,
  picture,
  now,
  unread,
  action,
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
  /** Mark as read or unread, in the time's place on hover or focus; none for the open chat. */
  readonly action: PlainRowAction | undefined;
  /** The list holds more than one source, so a chat's row names its own. */
  readonly named: boolean;
  /** What the row says under its name. */
  readonly line: string;
  /** What a chat search searched for, marked in the row; empty with none. */
  readonly highlight: string;
}) {
  return (
    <PlainRow
      id={row.conversation.id}
      picture={
        <Avatar
          name={chatAgent(row)?.name ?? row.conversation.title}
          picture={picture}
          tint={chatTint(row)}
          size="sidebar"
        />
      }
      title={<Highlighted text={chatName(row)} term={highlight} />}
      afterTitle={afterName(row, named)}
      flag={waitsForPerson(row) ? messengerWords.needsYouDot : undefined}
      line={<Highlighted text={line} term={highlight} />}
      time={
        row.last === undefined ? undefined : <TimeStamp at={new Date(row.last.sentAt)} now={now} />
      }
      unread={
        unread === 0
          ? undefined
          : { count: messengerWords.unreadCount(unread), label: messengerWords.unread }
      }
      current={current}
      onSelect={() => onSelect(row.conversation.id)}
      action={action}
    />
  );
}
