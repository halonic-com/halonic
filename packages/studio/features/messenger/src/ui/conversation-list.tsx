import type { MessagingId } from "@halonicjs/ports";
import { Avatar, clockTime, StatusChip, TabList, TabPanel, useTabIds } from "@halonicjs/studio-kit";
import { useRef } from "react";
import { channelSize, isChannel, workingMembers } from "../channel.ts";
import { waitingLine } from "../channel-waiting.ts";
import { chatAgent, chatName } from "../chat-name.ts";
import type { ConversationRow, MessengerTab } from "../messenger.ts";
import { messengerWords } from "../messenger-words.ts";
import { type AgentPictures, pictureOf } from "./agent-pictures.ts";
import { ChatsSkeleton, useFadeIn } from "./load-states.tsx";

/** The props of {@link ConversationList}. */
export interface ConversationListProps {
  readonly tab: MessengerTab;
  readonly onTab: (tab: MessengerTab) => void;
  /** The tab's conversations, newest first; undefined until the first read landed. */
  readonly rows: readonly ConversationRow[] | undefined;
  /** Reads the chats again: the skeleton's Try again. */
  readonly onRetry: () => void;
  readonly selected: MessagingId | undefined;
  readonly onSelect: (conversation: MessagingId) => void;
  /** Each chat agent's picture, read once; a row without one shows its initial. */
  readonly pictures: AgentPictures;
  /** The Messenger's clock, for each row's time. */
  readonly now: Date;
  /** Whether a row has an agent's message the person hasn't seen: its dot. */
  readonly unread: (row: ConversationRow) => boolean;
  /** The chats come from more than one source, so each chat's row names its own. */
  readonly manySources: boolean;
}

const tabs = [
  { id: "all", label: messengerWords.tabs.all },
  { id: "waiting", label: messengerWords.tabs.waiting },
] as const;

/**
 * The Messenger's list (HAL-17421 render 4a): the tabs All and Waiting for me, then one row per
 * conversation with its name, its newest message and its time, a dot while it holds a message the
 * person hasn't seen, and "1 card" while its agent's cards wait (`messenger.chat-rows`). A row names
 * its source only when the chats come from more than one. The open conversation's row is marked
 * current. Until the chats are read, the tabs stand over skeleton rows (`messenger.load-states`).
 */
export function ConversationList({
  tab,
  onTab,
  rows,
  onRetry,
  selected,
  onSelect,
  pictures,
  now,
  unread,
  manySources,
}: ConversationListProps) {
  const ids = useTabIds();
  // The rows fade in once they arrive in the skeleton's place; the tabs were already there.
  const list = useRef<HTMLUListElement>(null);
  useFadeIn(list, rows !== undefined);
  return (
    <div className="flex min-h-0 flex-col gap-2">
      <TabList
        label={messengerWords.tabsLabel}
        tabs={tabs}
        selected={tab}
        onSelect={onTab}
        ids={ids}
      />
      <TabPanel ids={ids} tabs={tabs} selected={tab}>
        {rows === undefined ? <ChatsSkeleton onRetry={onRetry} /> : null}
        {rows?.length === 0 ? (
          <p className="px-2 py-4 text-small text-fg-muted">
            {tab === "waiting" ? messengerWords.nothingWaiting : messengerWords.noChats}
          </p>
        ) : null}
        {rows === undefined || rows.length === 0 ? null : (
          <ul ref={list} className="flex flex-col gap-1">
            {rows.map((row) => (
              <li key={row.conversation.id}>
                <Row
                  row={row}
                  tab={tab}
                  current={row.conversation.id === selected}
                  onSelect={onSelect}
                  picture={pictureOf(pictures, row)}
                  now={now}
                  unread={unread(row) && row.conversation.id !== selected}
                  named={manySources}
                />
              </li>
            ))}
          </ul>
        )}
      </TabPanel>
    </div>
  );
}

/**
 * What a row says under its name: in Waiting for me, a channel's oldest question ("Elena asks you:
 * Which hostname? · +1 more"); for a channel, who is working; else the newest message's first
 * line, "You: " first when the person wrote it.
 */
function rowLine(row: ConversationRow, tab: MessengerTab): string {
  const channel = isChannel(row);
  const waiting = channel && tab === "waiting" ? waitingLine(row.questions ?? []) : undefined;
  const working = channel ? workingMembers(row) : undefined;
  return waiting ?? working ?? preview(row);
}

/** After a row's name: a channel's size (k14a); a chat's source, when the list has two. */
function afterName(row: ConversationRow, named: boolean): string | undefined {
  if (isChannel(row)) return channelSize(row);
  return named ? row.source?.label : undefined;
}

function preview({ last }: ConversationRow): string {
  if (last === undefined) return "";
  const line = last.body.trim().split("\n")[0] ?? "";
  return last.author.kind === "me" ? `${messengerWords.youSaid}${line}` : line;
}

function Row({
  row,
  tab,
  current,
  onSelect,
  picture,
  now,
  unread,
  named,
}: {
  readonly row: ConversationRow;
  readonly tab: MessengerTab;
  readonly current: boolean;
  readonly onSelect: (conversation: MessagingId) => void;
  readonly picture: ImageBitmap | undefined;
  readonly now: Date;
  readonly unread: boolean;
  /** The list holds more than one source, so a chat's row names its own. */
  readonly named: boolean;
}) {
  const line = rowLine(row, tab);
  const after = afterName(row, named);
  const cards = row.openCards ?? 0;
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
          <span className="min-w-0 flex-1 truncate text-body">
            <bdi>{chatName(row)}</bdi>
            {after === undefined ? null : (
              <span className="text-small text-fg-muted"> · {after}</span>
            )}
          </span>
          {row.last === undefined ? null : (
            <span className="shrink-0 text-small text-fg-muted">
              {clockTime(new Date(row.last.sentAt), now)}
            </span>
          )}
        </span>
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-small text-fg-muted">{line}</span>
          {cards === 0 ? null : (
            <StatusChip tone="warning">{messengerWords.openCards(cards)}</StatusChip>
          )}
          {unread ? (
            <span data-unread className="size-2 shrink-0 rounded-full bg-accent">
              <span className="sr-only">{messengerWords.unread}</span>
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}
