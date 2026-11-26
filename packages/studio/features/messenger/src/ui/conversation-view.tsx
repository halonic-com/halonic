import type { Message, MessagingId } from "@halonicjs/ports";
import { Avatar, ContentHeader } from "@halonicjs/studio-kit";
import type { EngineWords } from "@halonicjs/studio-shell";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { chatTint } from "../agent-tint.ts";
import { isChannel } from "../channel.ts";
import type { PendingMessage } from "../chat-layout.ts";
import { chatAgent, chatName } from "../chat-name.ts";
import { activityOf, type ConversationRow, type Messenger } from "../messenger.ts";
import { messengerWords } from "../messenger-words.ts";
import { ActivityButton } from "./activity-toggle.tsx";
import { CardsBar } from "./cards-bar.tsx";
import { ChannelHeaderActions } from "./channel-header-actions.tsx";
import { authorOf } from "./channel-message.tsx";
import { ChatBox } from "./chat-box.tsx";
import { useChatCards } from "./chat-cards.tsx";
import { ChatMenu } from "./chat-menu.tsx";
import { FindBar, FindButton, useFind } from "./find-bar.tsx";
import { MembersPanel } from "./members-panel.tsx";
import { Transcript } from "./transcript.tsx";
import { useReactions } from "./use-reactions.ts";
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
  /** **Mark as unread** in the header's ··· menu: the page marks the chat and closes it. */
  readonly onMarkUnread?: () => void;
  /** The chat agent's picture for the header and its messages; without one, its initial shows. */
  readonly picture?: ImageBitmap | undefined;
  /** How a failed read says the engine isn't answering. */
  readonly words: EngineWords;
}

/**
 * One open conversation (HAL-17421 render 4a): its agent and activity in the
 * header, a find bar for its messages (Ctrl+F), the messages and the agent's cards
 * oldest first, "3 cards waiting" in a direct chat while any card waits
 * (`messenger.inline-cards`), and the box. While its source is offline or signed out, the box keeps the text and
 * Send sends nothing (requirement `messenger.conversations`). Files picked or
 * pasted wait in the box and go with the message (`messenger.files`); the
 * agent's cards and "Ask for an update" are its quick actions
 * (`messenger.quick-actions`). The page gives each conversation its own view
 * (a `key`), so its draft and find bar start fresh.
 *
 * Its status regions read out what the agent writes after the chat opened ("Chief: …", never on
 * opening the chat), the option that answered a card, and what the find bar found (HAL-18074 MS1,
 * MS2 and MS4).
 */
export function ConversationView({
  messenger,
  row,
  changed,
  onLeft,
  onChanged,
  onMarkUnread,
  picture,
  words,
}: ConversationViewProps) {
  // What the chat's status region reads out: a new message, or the option that answered a card.
  // Each gets its own key, so the same words twice are read twice (HAL-18316 MS8).
  const [said, setSaid] = useState({ text: "", count: 0 });
  const say = useCallback(
    (text: string) => setSaid((last) => ({ text, count: last.count + 1 })),
    [],
  );
  const [membersOpen, setMembersOpen] = useState(false);
  const section = useRef<HTMLElement>(null);
  const { messages, questions, failure, read } = useMessages(messenger, row, changed, say);
  const { pending, sending } = usePending();
  const reactions = useReactions(messenger.reactions, row, changed, messenger.now);
  const find = useFind(messages);
  const current = find.matches[find.at];
  // The match shown scrolls into the middle of the chat.
  useEffect(() => {
    if (current === undefined) return;
    const shown = section.current?.querySelector(`[data-message="${CSS.escape(current)}"]`);
    shown?.scrollIntoView?.({ block: "center" });
  }, [current]);

  // Once a card is answered and gone, the next card's first option, or else the box, takes focus.
  const focusAfterAnswer = useCallback(() => {
    const next =
      section.current?.querySelector<HTMLElement>("[data-chat-card] :is(button, input)") ??
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

  return (
    <section ref={section} aria-label={chatName(row)} className="flex min-h-0 flex-1 flex-col">
      <ConversationHeader
        row={row}
        picture={picture}
        find={<FindButton find={find} />}
        menu={
          onMarkUnread === undefined || !messenger.canMarkUnread(row) ? null : (
            <ChatMenu name={chatName(row)} onMarkUnread={onMarkUnread} />
          )
        }
      >
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
      {find.open ? (
        <FindBar
          find={find}
          onClosed={() =>
            section.current?.querySelector<HTMLElement>("header [data-find]")?.focus()
          }
        />
      ) : null}
      {isChannel(row) ? <WaitingBar row={row} section={section} /> : null}
      <div className="flex min-h-0 flex-1">
        <Transcript
          messenger={messenger}
          row={row}
          messages={messages}
          cards={cards}
          pending={pending}
          questions={questions}
          searching={find.text.trim() !== ""}
          found={{ matches: new Set(find.matches), current }}
          failure={failure}
          words={words}
          onRetry={() => void read().catch(reportRead)}
          onAsked={read}
          picture={picture}
          onAnswered={onAnswered}
          reactions={reactions}
          announce={say}
        />
        {membersOpen ? (
          <MembersPanel
            messenger={messenger}
            row={row}
            onChanged={onChanged ?? (() => undefined)}
            announce={say}
          />
        ) : null}
      </div>
      {/* A channel has the waiting bar at the top instead: one count per screen (HAL-18483). Until
          the transcript shows there is no card for Next to go to. */}
      {isChannel(row) || messages === undefined ? null : (
        <CardsBar cards={cards ?? []} section={section} />
      )}
      <ChatBox
        messenger={messenger}
        row={row}
        onSending={sending}
        onSent={read}
        onChanged={onChanged ?? (() => undefined)}
      />
    </section>
  );
}

/**
 * The chat's messages, read again on each change. A message the agent writes after the first read
 * is passed to `announce`.
 */
function useMessages(
  messenger: Messenger,
  row: ConversationRow,
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
  const [failure, setFailure] = useState<unknown>(undefined);
  // Counts the reads, so an answer that arrives after a newer read's never shows.
  const reads = useRef(0);
  // The messages the last read found; none before the first.
  const seen = useRef<ReadonlySet<Message["id"]> | undefined>(undefined);

  const read = useCallback(async () => {
    reads.current += 1;
    const thisRead = reads.current;
    const [found, asked] = await readChat(messenger, id, channel).catch((error: unknown) => {
      if (thisRead === reads.current) setFailure(error);
      throw error;
    });
    if (thisRead !== reads.current) return;
    setMessages(found);
    setQuestions(asked);
    setFailure(undefined);
    messenger.markSeen(latestRow.current, found);
    const before = seen.current;
    seen.current = new Set(found.map((message) => message.id));
    const fresh = before === undefined ? undefined : newestFromAgent(found, before);
    if (fresh !== undefined)
      announce(messengerWords.newMessage(authorOf(fresh, latestRow.current), fresh.body));
  }, [messenger, id, channel, announce]);

  useEffect(() => {
    void read().catch(reportRead);
  }, [read, changed]);

  // A read that lands once the chat closed counts as replaced, so it doesn't mark the chat read
  // again after its header's **Mark as unread** closed it.
  useEffect(
    () => () => {
      reads.current += 1;
    },
    [],
  );

  return { messages, questions, failure, read };
}

/**
 * The person's messages on their way (motion 4 of the design review): `sending` shows one at once
 * and gives the function that takes it away once it was sent, or wasn't.
 */
function usePending() {
  const [pending, setPending] = useState<readonly PendingMessage[]>([]);
  const count = useRef(0);
  const sending = useCallback((body: string, files: readonly string[]) => {
    count.current += 1;
    const key = count.current;
    setPending((before) => [...before, { key, body, files }]);
    return () => setPending((before) => before.filter((each) => each.key !== key));
  }, []);
  return { pending, sending };
}

/** A chat's messages; a channel's open questions too, for its work lines. */
function readChat(
  messenger: Messenger,
  id: MessagingId,
  channel: boolean,
): Promise<[readonly Message[], ReadonlyMap<MessagingId, string>]> {
  // Only a channel's work lines show a question's text, so a chat reads no inbox for them.
  return Promise.all([
    messenger.messages(id),
    channel ? messenger.questions() : new Map<MessagingId, string>(),
  ]);
}

/** A read that failed: the transcript says so, and the console keeps the error. */
function reportRead(error: unknown): void {
  console.error("The chat couldn't be read:", error);
}

/**
 * The newest message an agent wrote that wasn't in the chat at the last read. An automatic note
 * isn't the agent's reply, so it isn't read out as one (`messenger.automatic-notes`).
 */
function newestFromAgent(
  found: readonly Message[],
  before: ReadonlySet<Message["id"]>,
): Message | undefined {
  return found.findLast(
    (message) =>
      message.author.kind !== "me" && message.automatic !== true && !before.has(message.id),
  );
}

/** The conversation's agent, its source and activity, and the find bar's icon. */
function ConversationHeader({
  row,
  picture,
  find,
  menu,
  children,
}: {
  readonly row: ConversationRow;
  readonly picture: ImageBitmap | undefined;
  /** The icon that opens the find bar (Ctrl+F). */
  readonly find: ReactNode;
  /** The ··· menu, last; none while the chat has nothing to mark unread. */
  readonly menu: ReactNode;
  /** A channel's Members and Leave channel. */
  readonly children: ReactNode;
}) {
  const activity = messengerWords.activity[activityOf(row)];
  return (
    <ContentHeader
      picture={
        <Avatar
          name={chatAgent(row)?.name ?? row.conversation.title}
          picture={picture}
          tint={chatTint(row)}
          size="header"
        />
      }
      title={chatName(row)}
      line={[row.source?.label ?? "", activity].filter((part) => part !== "").join(" · ")}
      actions={
        <>
          {children}
          {find}
          <ActivityButton />
          {menu}
        </>
      }
    />
  );
}
