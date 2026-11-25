import type { Message, MessagingId } from "@halonicjs/ports";
import { Avatar, Input } from "@halonicjs/studio-kit";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { isChannel } from "../channel.ts";
import { chatAgent, chatName } from "../chat-name.ts";
import { activityOf, type ConversationRow, type Messenger } from "../messenger.ts";
import { messengerWords } from "../messenger-words.ts";
import { CardsBar } from "./cards-bar.tsx";
import { ChannelHeaderActions } from "./channel-header-actions.tsx";
import { authorOf } from "./channel-message.tsx";
import { ChatBox } from "./chat-box.tsx";
import { useChatCards } from "./chat-cards.tsx";
import { MembersPanel } from "./members-panel.tsx";
import { Transcript } from "./transcript.tsx";
import { WaitingBar } from "./waiting-bar.tsx";

/** The props of {@link ConversationView}. */
export interface ConversationViewProps {
  readonly messenger: Messenger;
  readonly row: ConversationRow;
  /** Grows each time a source changes, so the messages are read again. */
  readonly changed: number;
  /** The person left the channel; the page closes it. */
  readonly onLeft?: () => void;
  /** The channel's members changed; the page reads the list again. */
  readonly onChanged?: () => void;
  /** The chat agent's picture for the header; without one, its initial shows. */
  readonly picture?: ImageBitmap | undefined;
}

/**
 * One open conversation (HAL-17421 render 4a): its agent and activity in the
 * header, a search through its messages, the messages and the agent's cards
 * oldest first, "3 cards waiting" in a direct chat while any card waits
 * (`messenger.inline-cards`), and the box. While its source is offline or signed out, the box keeps the text and
 * Send sends nothing (requirement `messenger.conversations`). Files picked or
 * pasted wait in the box and go with the message (`messenger.files`); the
 * agent's cards and "Ask for an update" are its quick actions
 * (`messenger.quick-actions`). The page gives each conversation its own view
 * (a `key`), so its draft and search start fresh.
 *
 * Its status regions read out what the agent writes after the chat opened ("Chief: …", never on a
 * search or on opening the chat), the option that answered a card, and that no message matches the
 * search (HAL-18074 MS1, MS2 and MS4).
 */
export function ConversationView({
  messenger,
  row,
  changed,
  onLeft,
  onChanged,
  picture,
}: ConversationViewProps) {
  const [search, setSearch] = useState("");
  // What the chat's status region reads out: a new message, or the option that answered a card.
  // Each gets its own key, so the same words twice are read twice (HAL-18316 MS8).
  const [said, setSaid] = useState({ text: "", count: 0 });
  const say = useCallback(
    (text: string) => setSaid((last) => ({ text, count: last.count + 1 })),
    [],
  );
  const [membersOpen, setMembersOpen] = useState(false);
  const section = useRef<HTMLElement>(null);
  const { messages, questions, read } = useMessages(messenger, row, search, changed, say);

  // Once a card is answered and gone, the next card's first option, or else the box, takes focus.
  const focusAfterAnswer = useCallback(() => {
    const next =
      section.current?.querySelector<HTMLElement>("[data-chat-card] button") ??
      section.current?.querySelector<HTMLElement>("textarea");
    next?.focus();
  }, []);
  const { cards, onAnswered } = useChatCards(
    messenger.quickActions,
    row,
    changed,
    say,
    focusAfterAnswer,
  );

  const noMatch = messages?.length === 0 && search.trim() !== "";
  return (
    <section ref={section} aria-label={chatName(row)} className="flex min-h-0 flex-1 flex-col">
      <ConversationHeader row={row} picture={picture} search={search} onSearch={setSearch}>
        {isChannel(row) ? (
          <ChannelHeaderActions
            messenger={messenger}
            row={row}
            membersOpen={membersOpen}
            onMembers={() => setMembersOpen((before) => !before)}
            onLeft={onLeft}
          />
        ) : null}
      </ConversationHeader>
      <p role="status" className="sr-only">
        <span key={said.count}>{said.text}</span>
      </p>
      <p role="status" className={noMatch ? "px-4 pt-4 text-small text-fg-muted" : undefined}>
        {noMatch ? messengerWords.noMatches : ""}
      </p>
      {isChannel(row) ? <WaitingBar row={row} section={section} /> : null}
      <div className="flex min-h-0 flex-1">
        <Transcript
          messenger={messenger}
          row={row}
          messages={messages}
          cards={cards}
          questions={questions}
          searching={search.trim() !== ""}
          onAnswered={onAnswered}
        />
        {membersOpen ? (
          <MembersPanel
            messenger={messenger}
            row={row}
            onChanged={onChanged ?? (() => undefined)}
          />
        ) : null}
      </div>
      {/* A channel has the waiting bar at the top instead: one count per screen (HAL-18483). */}
      {isChannel(row) ? null : <CardsBar cards={cards ?? []} section={section} />}
      <ChatBox messenger={messenger} row={row} onSent={read} />
    </section>
  );
}

/**
 * The chat's messages found by `search`, read again on each change. A message the agent writes
 * after the first read without a search is passed to `announce`.
 */
function useMessages(
  messenger: Messenger,
  row: ConversationRow,
  search: string,
  changed: number,
  announce: (line: string) => void,
) {
  const id = row.conversation.id;
  const channel = isChannel(row);
  // The row is read again on each change; the author's name is taken from the newest one.
  const latestRow = useRef(row);
  latestRow.current = row;
  const [messages, setMessages] = useState<readonly Message[] | undefined>(undefined);
  const [questions, setQuestions] = useState<ReadonlyMap<MessagingId, string>>(new Map());
  // Counts the reads, so an answer that arrives after a newer read's never shows.
  const reads = useRef(0);
  // The messages the last read without a search found; none before the first and after a search.
  const seen = useRef<ReadonlySet<Message["id"]> | undefined>(undefined);

  const read = useCallback(async () => {
    reads.current += 1;
    const thisRead = reads.current;
    // Only a channel's work lines show a question's text, so a chat reads no inbox for them.
    const [found, asked] = await Promise.all([
      messenger.messages(id, search),
      channel ? messenger.questions() : new Map<MessagingId, string>(),
    ]);
    if (thisRead !== reads.current) return;
    setMessages(found);
    setQuestions(asked);
    const before = search.trim() === "" ? seen.current : undefined;
    seen.current = search.trim() === "" ? new Set(found.map((message) => message.id)) : undefined;
    const fresh = before === undefined ? undefined : newestFromAgent(found, before);
    if (fresh !== undefined)
      announce(messengerWords.newMessage(authorOf(fresh, latestRow.current), fresh.body));
  }, [messenger, id, channel, search, announce]);

  useEffect(() => {
    void read().catch((error: unknown) => console.error("The chat couldn't be read:", error));
  }, [read, changed]);

  return { messages, questions, read };
}

/** The newest message an agent wrote that wasn't in the chat at the last read. */
function newestFromAgent(
  found: readonly Message[],
  before: ReadonlySet<Message["id"]>,
): Message | undefined {
  return found.filter((message) => message.author.kind !== "me" && !before.has(message.id)).at(-1);
}

/** The conversation's agent, its source and activity, and the search through its messages. */
function ConversationHeader({
  row,
  picture,
  search,
  onSearch,
  children,
}: {
  readonly row: ConversationRow;
  readonly picture: ImageBitmap | undefined;
  readonly search: string;
  readonly onSearch: (search: string) => void;
  /** A channel's Members and Leave channel. */
  readonly children: ReactNode;
}) {
  const activity = messengerWords.activity[activityOf(row)];
  return (
    <header className="flex items-center gap-3 border-b border-border px-4 py-3">
      <Avatar name={chatAgent(row)?.name ?? row.conversation.title} picture={picture} />
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 className="truncate text-body-strong">
          <bdi>{chatName(row)}</bdi>
        </h2>
        <p className="text-small text-fg-muted">
          {[row.source?.label ?? "", activity].filter((part) => part !== "").join(" · ")}
        </p>
      </div>
      {children}
      <div className="w-56">
        <Input
          size="sm"
          type="search"
          aria-label={messengerWords.searchLabel}
          placeholder={messengerWords.searchLabel}
          value={search}
          onChange={(event) => onSearch(event.target.value)}
        />
      </div>
    </header>
  );
}
